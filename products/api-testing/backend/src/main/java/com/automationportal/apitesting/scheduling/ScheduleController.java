package com.automationportal.apitesting.scheduling;

import com.automationportal.apitesting.regularapi.RegularApi;
import com.automationportal.apitesting.regularapi.RegularApiRepository;
import com.automationportal.apitesting.security.CurrentProjectService;
import com.automationportal.apitesting.security.CurrentUserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/schedules")
@RequiredArgsConstructor
public class ScheduleController {

    private final ScheduleRepository repository;
    private final RegularApiRepository regularApiRepository;
    private final com.automationportal.apitesting.group.ApiGroupRepository groupRepository;
    private final com.automationportal.apitesting.audit.AuditService auditService;
    private final ScheduleWorker scheduleWorker;
    private final org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor scheduleWorkerExecutor;
    private final CurrentProjectService currentProjectService;
    private final CurrentUserService currentUserService;
    private final SchedulerProperties schedulerProperties;
    private final ScheduleJobRepository scheduleJobRepository;

    @Data
    public static class SchedulePayload {
        @NotBlank private String name;
        /** API (default) or GROUP. */
        private Schedule.TargetType targetType = Schedule.TargetType.API;
        private Long regularApiId;
        private Long groupId;
        @NotNull private Schedule.FrequencyType frequencyType;
        private String frequencyValue;
        private Integer maxRetries;
        /** Comma-separated report recipient emails. */
        @NotBlank private String recipients;
    }

    @Data
    public static class ScheduleView {
        private Schedule schedule;
        private String apiName;
        private String groupName;
        private Long moduleId;
    }

    /** List with API/group/module info; groupBy is rendered client-side from these fields. */
    @GetMapping
    public List<ScheduleView> list(@RequestParam(required = false) Long moduleId) {
        Long projectId = currentProjectService.requireProjectId();
        Map<Long, RegularApi> apis = regularApiRepository.findByProjectId(projectId).stream()
                .collect(Collectors.toMap(RegularApi::getId, a -> a));
        Map<Long, String> groupNames = groupRepository.findByProjectIdOrderByUpdatedAtDesc(projectId).stream()
                .collect(Collectors.toMap(g -> g.getId(), g -> g.getName()));
        return repository.findByProjectId(projectId).stream()
                .map(s -> {
                    ScheduleView v = new ScheduleView();
                    v.setSchedule(s);
                    if (s.getTargetType() == Schedule.TargetType.GROUP) {
                        v.setGroupName(groupNames.getOrDefault(s.getGroupId(), "(deleted)"));
                        v.setApiName(null);
                    } else {
                        RegularApi api = apis.get(s.getRegularApiId());
                        v.setApiName(api == null ? "(deleted)" : api.getName());
                        v.setModuleId(api == null ? null : api.getModuleId());
                    }
                    return v;
                })
                .filter(v -> moduleId == null || Objects.equals(v.getModuleId(), moduleId))
                .toList();
    }

    /**
     * Queue depth for the caller's project, so a user waiting on a scheduled run can be
     * told where they actually are instead of just seeing nothing happen. Global counts
     * are included because the wait depends on the whole queue, not just this project's
     * share of it.
     */
    @GetMapping("/queue-status")
    public Map<String, Object> queueStatus() {
        Long projectId = currentProjectService.requireProjectId();
        long globalPending = scheduleJobRepository.countByStatus(ScheduleJob.Status.PENDING);
        long globalRunning = scheduleJobRepository.countByStatus(ScheduleJob.Status.RUNNING);
        int concurrency = Math.max(1, schedulerProperties.getMaxConcurrentExecutions());

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("queueEnabled", schedulerProperties.isQueueEnabled());
        out.put("projectPending", scheduleJobRepository.countByProjectIdAndStatus(projectId, ScheduleJob.Status.PENDING));
        out.put("projectRunning", scheduleJobRepository.countByProjectIdAndStatus(projectId, ScheduleJob.Status.RUNNING));
        out.put("globalPending", globalPending);
        out.put("globalRunning", globalRunning);
        out.put("concurrency", concurrency);
        // Deliberately coarse: batches still ahead x how long a batch takes. Good enough to
        // set expectations, and honest about being an estimate rather than a promise.
        out.put("estimatedWaitMinutes", (long) Math.ceil((double) globalPending / concurrency));
        return out;
    }

    @PostMapping
    public Schedule create(@Valid @RequestBody SchedulePayload payload) {
        Long projectId = currentProjectService.requireProjectId();
        int limit = schedulerProperties.getMaxSchedulesPerProject();
        if (limit > 0 && repository.countByProjectId(projectId) >= limit) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This workspace already has its maximum of " + limit + " schedules. "
                            + "Delete or replace an existing schedule before adding another.");
        }
        Schedule s = new Schedule();
        apply(s, payload);
        s.setProjectId(projectId);
        s.setCreatedByEmail(currentUserService.currentEmail());
        s.setNextRunAt(initialNextRun(s)); // anchored types wait for their time; others run on the next poll tick
        s = repository.save(s);
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.SCHEDULE, s.getId(),
                com.automationportal.apitesting.audit.AuditLog.Action.CREATE,
                "Created schedule '" + s.getName() + "' (" + s.getFrequencyType() + ", target " + s.getTargetType() + ")");
        return s;
    }

    @PutMapping("/{id}")
    public Schedule update(@PathVariable Long id, @Valid @RequestBody SchedulePayload payload) {
        Schedule s = find(id);
        apply(s, payload);
        s.setRetryCount(0);
        s.setNextRunAt(initialNextRun(s)); // re-anchor to the (possibly new) cadence
        s = repository.save(s);
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.SCHEDULE, id,
                com.automationportal.apitesting.audit.AuditLog.Action.UPDATE,
                "Updated schedule '" + s.getName() + "' (" + s.getFrequencyType()
                        + (s.getFrequencyValue() != null ? " " + s.getFrequencyValue() : "") + ")");
        return s;
    }

    /**
     * Runs the schedule immediately on the worker pool (works even when
     * PAUSED). The conditional lock guarantees it can't double-run against the
     * poller; the worker recomputes the next anchored slot afterwards, so a
     * manual run never shifts a "daily at 10:00" cadence.
     */
    @PostMapping("/{id}/run-now")
    @org.springframework.transaction.annotation.Transactional
    public Schedule runNow(@PathVariable Long id) {
        Schedule s = find(id);
        Instant now = Instant.now();
        int locked = repository.tryManualLock(id, "manual-run", now.plusSeconds(300), now);
        if (locked == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Schedule is already running");
        }
        try {
            scheduleWorkerExecutor.execute(() -> scheduleWorker.run(id));
        } catch (java.util.concurrent.RejectedExecutionException ex) {
            // Pool full. Rolling this transaction back also undoes the lock above,
            // so the schedule is left free rather than stuck until its lease expires.
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Execution capacity is full right now — try again in a moment");
        }
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.SCHEDULE, id,
                com.automationportal.apitesting.audit.AuditLog.Action.EXECUTE,
                "Manually triggered schedule '" + s.getName() + "'");
        return s;
    }

    private void apply(Schedule s, SchedulePayload payload) {
        Long projectId = currentProjectService.requireProjectId();
        Schedule.TargetType target = payload.getTargetType() == null
                ? Schedule.TargetType.API : payload.getTargetType();
        if (target == Schedule.TargetType.API) {
            boolean owned = payload.getRegularApiId() != null && regularApiRepository.findById(payload.getRegularApiId())
                    .map(a -> projectId.equals(a.getProjectId())).orElse(false);
            if (!owned) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Regular API does not exist");
            }
        } else {
            boolean owned = payload.getGroupId() != null && groupRepository.findById(payload.getGroupId())
                    .map(g -> projectId.equals(g.getProjectId())).orElse(false);
            if (!owned) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group does not exist");
            }
        }
        validateFrequency(payload);
        s.setName(payload.getName());
        s.setTargetType(target);
        s.setRegularApiId(target == Schedule.TargetType.API ? payload.getRegularApiId() : null);
        s.setGroupId(target == Schedule.TargetType.GROUP ? payload.getGroupId() : null);
        s.setFrequencyType(payload.getFrequencyType());
        s.setFrequencyValue(payload.getFrequencyValue());
        s.setRecipients(payload.getRecipients().trim());
        if (payload.getMaxRetries() != null) s.setMaxRetries(Math.max(0, payload.getMaxRetries()));
    }

    @PatchMapping("/{id}/pause")
    public Schedule pause(@PathVariable Long id) {
        Schedule s = find(id);
        s.setStatus(Schedule.Status.PAUSED);
        s = repository.save(s);
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.SCHEDULE, id,
                com.automationportal.apitesting.audit.AuditLog.Action.PAUSE, "Paused schedule '" + s.getName() + "'");
        return s;
    }

    @PatchMapping("/{id}/resume")
    public Schedule resume(@PathVariable Long id) {
        Schedule s = find(id);
        s.setStatus(Schedule.Status.ACTIVE);
        if (s.getNextRunAt() == null || s.getNextRunAt().isBefore(Instant.now())) {
            s.setNextRunAt(initialNextRun(s)); // anchored types resume at their next slot, not immediately
        }
        s = repository.save(s);
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.SCHEDULE, id,
                com.automationportal.apitesting.audit.AuditLog.Action.RESUME, "Resumed schedule '" + s.getName() + "'");
        return s;
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        Schedule s = find(id);
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.SCHEDULE, id,
                com.automationportal.apitesting.audit.AuditLog.Action.DELETE,
                "Deleted schedule '" + s.getName() + "'");
        repository.deleteById(id);
    }

    private Schedule find(Long id) {
        Schedule s = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Schedule not found"));
        if (!currentProjectService.requireProjectId().equals(s.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Schedule not found");
        }
        return s;
    }

    private void validateFrequency(SchedulePayload p) {
        String v = p.getFrequencyValue();
        switch (p.getFrequencyType()) {
            case EVERY_X_MIN -> {
                try {
                    if (Long.parseLong(v.trim()) < 1) throw new NumberFormatException();
                } catch (Exception e) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "frequencyValue must be a positive number of minutes");
                }
            }
            case CRON -> {
                if (v == null || !CronExpression.isValidExpression(v.trim())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "frequencyValue must be a valid cron expression (6 fields, Spring format)");
                }
            }
            case DAILY -> {
                if (v != null && !v.isBlank() && ScheduleWorker.parseDailyTime(v) == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "frequencyValue for DAILY must be a time like \"10:00\" (24h)");
                }
            }
            case WEEKLY -> {
                if (v != null && !v.isBlank() && ScheduleWorker.parseWeeklyAnchor(v) == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "frequencyValue for WEEKLY must be a day + time like \"MON 10:00\"");
                }
            }
            default -> { /* HOURLY needs no value */ }
        }
    }

    /**
     * Anchored schedules (DAILY "10:00", WEEKLY "MON 10:00", CRON) start at
     * their next occurrence; interval types start immediately.
     */
    private Instant initialNextRun(Schedule s) {
        Instant now = Instant.now();
        boolean anchored = switch (s.getFrequencyType()) {
            case DAILY -> ScheduleWorker.parseDailyTime(s.getFrequencyValue()) != null;
            case WEEKLY -> ScheduleWorker.parseWeeklyAnchor(s.getFrequencyValue()) != null;
            case CRON -> true;
            default -> false;
        };
        return anchored ? ScheduleWorker.computeNextRun(s.getFrequencyType(), s.getFrequencyValue(), now) : now;
    }
}
