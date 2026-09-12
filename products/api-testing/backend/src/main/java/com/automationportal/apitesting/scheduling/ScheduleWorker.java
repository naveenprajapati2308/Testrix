package com.automationportal.apitesting.scheduling;

import com.automationportal.apitesting.execution.dto.ExecutionResponse;
import com.automationportal.apitesting.history.ExecutionHistory;
import com.automationportal.apitesting.regularapi.DependencyExecutionService;
import com.automationportal.apitesting.regularapi.RegularApi;
import com.automationportal.apitesting.regularapi.RegularApiRepository;
import com.automationportal.apitesting.report.ReportData;
import com.automationportal.apitesting.report.ReportMailClient;
import com.automationportal.apitesting.report.ReportMarkdownRenderer;
import com.automationportal.apitesting.report.ReportPdfRenderer;
import com.automationportal.apitesting.report.ReportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;

/**
 * Executes one claimed schedule on the worker pool: runs the regular API
 * (dependencies + validation included), applies retry-with-backoff on failure,
 * computes the next run, and releases the lock.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ScheduleWorker {

    private final SchedulerProperties properties;
    private final ScheduleRepository scheduleRepository;
    private final RegularApiRepository regularApiRepository;
    private final DependencyExecutionService dependencyExecutionService;
    private final com.automationportal.apitesting.group.ApiGroupRepository groupRepository;
    private final com.automationportal.apitesting.group.GroupExecutionService groupExecutionService;
    private final ReportService reportService;
    private final ReportMarkdownRenderer markdownRenderer;
    private final ReportPdfRenderer pdfRenderer;
    private final ReportMailClient mailClient;

    public void run(Long scheduleId) {
        Schedule schedule = scheduleRepository.findById(scheduleId).orElse(null);
        if (schedule == null) return;

        Instant now = Instant.now();
        schedule.setLastRunAt(now);
        try {
            if (schedule.getTargetType() == Schedule.TargetType.GROUP) {
                runGroupTarget(schedule, now);
                return;
            }

            RegularApi api = schedule.getRegularApiId() == null ? null
                    : regularApiRepository.findById(schedule.getRegularApiId()).orElse(null);
            if (api == null) {
                log.warn("Schedule '{}' points to missing regular API {} — disabling", schedule.getName(), schedule.getRegularApiId());
                schedule.setStatus(Schedule.Status.DISABLED);
                schedule.setLastRunStatus(Schedule.RunStatus.FAILED);
                return;
            }

            var result = dependencyExecutionService.execute(api, ExecutionHistory.TriggeredBy.SCHEDULE, schedule.getId());
            ExecutionResponse response = result.getResponse();

            boolean httpOk = response.isSuccess()
                    && response.getStatusCode() != null && response.getStatusCode() < 400;
            boolean validationOk = result.getValidationPassed() == null || result.getValidationPassed();

            if (httpOk && validationOk) {
                schedule.setLastRunStatus(Schedule.RunStatus.SUCCESS);
                schedule.setRetryCount(0);
                schedule.setNextRunAt(nextRunWithJitter(schedule, now));
            } else if (response.isTimedOut()) {
                schedule.setLastRunStatus(Schedule.RunStatus.TIMEOUT);
                applyRetryOrAdvance(schedule, now);
            } else {
                schedule.setLastRunStatus(Schedule.RunStatus.FAILED);
                applyRetryOrAdvance(schedule, now);
            }
            emailReport(schedule, result.getExecutionHistoryId());
        } catch (Exception ex) {
            log.error("Schedule '{}' crashed: {}", schedule.getName(), ex.getMessage(), ex);
            schedule.setLastRunStatus(Schedule.RunStatus.FAILED);
            applyRetryOrAdvance(schedule, now);
        } finally {
            schedule.setLockedBy(null);
            schedule.setLockedUntil(null);
            scheduleRepository.save(schedule);
        }
    }

    /**
     * Group-target schedules run the whole group inline (already on a worker
     * thread) through the same execution pipeline. SUCCESS requires every
     * member to pass; a PARTIAL result counts as failed for retry purposes.
     */
    private void runGroupTarget(Schedule schedule, Instant now) {
        var group = schedule.getGroupId() == null ? null
                : groupRepository.findById(schedule.getGroupId()).orElse(null);
        if (group == null) {
            log.warn("Schedule '{}' points to missing group {} — disabling", schedule.getName(), schedule.getGroupId());
            schedule.setStatus(Schedule.Status.DISABLED);
            schedule.setLastRunStatus(Schedule.RunStatus.FAILED);
            return;
        }
        var execution = groupExecutionService.executeSync(group, schedule.getId());
        if (execution.getStatus() == com.automationportal.apitesting.group.ApiGroupExecution.Status.SUCCESS) {
            schedule.setLastRunStatus(Schedule.RunStatus.SUCCESS);
            schedule.setRetryCount(0);
            schedule.setNextRunAt(nextRunWithJitter(schedule, now));
        } else {
            schedule.setLastRunStatus(Schedule.RunStatus.FAILED);
            applyRetryOrAdvance(schedule, now);
        }
    }

    /** Best-effort: a report/email failure must never affect the schedule's own recorded
     * pass/fail result, so everything here is caught and only logged. */
    private void emailReport(Schedule schedule, Long executionHistoryId) {
        if (executionHistoryId == null) return;
        try {
            if (schedule.getRecipients() == null || schedule.getRecipients().isBlank()) {
                log.warn("Schedule '{}' has no report recipients — skipping email", schedule.getName());
                return;
            }
            var recipients = java.util.Arrays.stream(schedule.getRecipients().split(","))
                    .map(String::trim).filter(s -> !s.isEmpty()).toList();
            var data = reportService.buildForHistory(executionHistoryId);
            data.setRecipients(schedule.getRecipients());
            String subject = "Execution Report — \"" + schedule.getName() + "\" (" + data.getStatus() + ")";
            String html = "<p>Schedule <b>" + schedule.getName() + "</b> finished with status <b>"
                    + data.getStatus() + "</b>. Full report attached (PDF + Markdown).</p>";
            mailClient.send(recipients, subject, html, pdfRenderer.render(data), markdownRenderer.render(data).getBytes());
            schedule.setReportEmailSentAt(Instant.now());
        } catch (Exception e) {
            log.error("Failed to build/send report for schedule '{}': {}", schedule.getName(), e.getMessage(), e);
        }
    }

    /**
     * Retry with exponential backoff (30s, 2m, 10m), then fall back to the
     * normal cadence. A recurring schedule is never auto-disabled by failures.
     */
    private void applyRetryOrAdvance(Schedule schedule, Instant now) {
        if (schedule.getRetryCount() < schedule.getMaxRetries()) {
            schedule.setRetryCount(schedule.getRetryCount() + 1);
            schedule.setNextRunAt(now.plus(backoff(schedule.getRetryCount())));
        } else {
            schedule.setRetryCount(0);
            schedule.setNextRunAt(nextRunWithJitter(schedule, now));
        }
    }

    private Duration backoff(int attempt) {
        return switch (attempt) {
            case 1 -> Duration.ofSeconds(30);
            case 2 -> Duration.ofMinutes(2);
            default -> Duration.ofMinutes(10);
        };
    }

    static Instant computeNextRun(Schedule schedule, Instant from) {
        return computeNextRun(schedule.getFrequencyType(), schedule.getFrequencyValue(), from);
    }

    /**
     * Anchored slot plus this schedule's own fixed offset inside the jitter window.
     * The offset is derived from the id, so a schedule keeps the same slot on every
     * run instead of wandering, while thousands of schedules sharing one boundary
     * (the "everyone picked midnight" case) end up spread across the window.
     *
     * <p>Only DAILY/WEEKLY/CRON are shifted — they are the ones that anchor to a
     * wall-clock boundary and therefore collide. EVERY_X_MIN and HOURLY are measured
     * from the previous run, so they are already staggered and shifting them would
     * distort the interval the user asked for.
     */
    Instant nextRunWithJitter(Schedule schedule, Instant from) {
        Instant base = computeNextRun(schedule, from);
        int window = properties.getJitterSeconds();
        if (window <= 0 || schedule.getId() == null) return base;
        Schedule.FrequencyType type = schedule.getFrequencyType();
        if (type != Schedule.FrequencyType.DAILY && type != Schedule.FrequencyType.WEEKLY
                && type != Schedule.FrequencyType.CRON) {
            return base;
        }
        return base.plusSeconds(Math.floorMod(schedule.getId() * 2654435761L, window));
    }

    /**
     * DAILY/WEEKLY anchor to a fixed local time-of-day when frequencyValue is
     * set ("HH:mm" / "MON HH:mm"), so a 10:00 schedule always fires at 10:00
     * regardless of delays, retries, or downtime — it never drifts. Without a
     * value they fall back to the legacy fixed-interval behavior.
     */
    static Instant computeNextRun(Schedule.FrequencyType type, String value, Instant from) {
        return switch (type) {
            case EVERY_X_MIN -> from.plus(Duration.ofMinutes(parseMinutes(value)));
            case HOURLY -> from.plus(Duration.ofHours(1));
            case DAILY -> {
                LocalTime time = parseDailyTime(value);
                if (time == null) yield from.plus(Duration.ofDays(1));
                ZoneId zone = ZoneId.systemDefault();
                ZonedDateTime fromZ = ZonedDateTime.ofInstant(from, zone);
                ZonedDateTime candidate = fromZ.toLocalDate().atTime(time).atZone(zone);
                if (!candidate.isAfter(fromZ)) candidate = candidate.plusDays(1);
                yield candidate.toInstant();
            }
            case WEEKLY -> {
                WeeklyAnchor anchor = parseWeeklyAnchor(value);
                if (anchor == null) yield from.plus(Duration.ofDays(7));
                ZoneId zone = ZoneId.systemDefault();
                ZonedDateTime fromZ = ZonedDateTime.ofInstant(from, zone);
                ZonedDateTime candidate = fromZ.toLocalDate()
                        .with(TemporalAdjusters.nextOrSame(anchor.day()))
                        .atTime(anchor.time()).atZone(zone);
                if (!candidate.isAfter(fromZ)) candidate = candidate.plusWeeks(1);
                yield candidate.toInstant();
            }
            case CRON -> {
                CronExpression cron = CronExpression.parse(value);
                ZonedDateTime next = cron.next(ZonedDateTime.ofInstant(from, ZoneId.systemDefault()));
                yield next == null ? from.plus(Duration.ofDays(1)) : next.toInstant();
            }
        };
    }

    /** "HH:mm" (24h), or null for legacy interval behavior. */
    static LocalTime parseDailyTime(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return LocalTime.parse(value.trim());
        } catch (Exception e) {
            return null;
        }
    }

    record WeeklyAnchor(DayOfWeek day, LocalTime time) { }

    /** "MON 10:00" (day-of-week + 24h time), or null for legacy behavior. */
    static WeeklyAnchor parseWeeklyAnchor(String value) {
        if (value == null || value.isBlank()) return null;
        String[] parts = value.trim().split("\\s+");
        if (parts.length != 2) return null;
        LocalTime time = parseDailyTime(parts[1]);
        DayOfWeek day = parseDayOfWeek(parts[0]);
        return (day == null || time == null) ? null : new WeeklyAnchor(day, time);
    }

    private static DayOfWeek parseDayOfWeek(String s) {
        String u = s.trim().toUpperCase();
        for (DayOfWeek d : DayOfWeek.values()) {
            if (d.name().equals(u) || d.name().startsWith(u) && u.length() >= 3) return d;
        }
        return null;
    }

    private static long parseMinutes(String value) {
        try {
            return Math.max(1, Long.parseLong(value.trim()));
        } catch (Exception e) {
            return 5;
        }
    }
}
