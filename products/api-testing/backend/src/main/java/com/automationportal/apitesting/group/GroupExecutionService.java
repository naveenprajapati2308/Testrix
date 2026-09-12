package com.automationportal.apitesting.group;

import com.automationportal.apitesting.execution.dto.ExecutionContext;
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
import com.automationportal.apitesting.scheduling.Schedule;
import com.automationportal.apitesting.scheduling.ScheduleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * Runs a group: Group → API 1 (Base → Regular) → API 2 (Base → Regular) → …
 * → group result → history → dashboard. Reuses the existing dependency
 * execution pipeline — scheduled, manual and group execution share one path.
 * Manual triggers run on the bounded worker pool so the API thread returns
 * immediately with the RUNNING execution row.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupExecutionService {

    private final ApiGroupMemberRepository memberRepository;
    private final ApiGroupExecutionRepository executionRepository;
    private final RegularApiRepository regularApiRepository;
    private final DependencyExecutionService dependencyExecutionService;
    @Qualifier("scheduleWorkerExecutor")
    private final ThreadPoolTaskExecutor executor;
    private final ScheduleRepository scheduleRepository;
    private final ReportService reportService;
    private final ReportMarkdownRenderer markdownRenderer;
    private final ReportPdfRenderer pdfRenderer;
    private final ReportMailClient mailClient;

    /** Manual trigger: creates the RUNNING record and executes asynchronously. */
    public ApiGroupExecution executeAsync(ApiGroup group, String triggeredByEmail) {
        ApiGroupExecution execution = start(group, ApiGroupExecution.TriggeredBy.MANUAL, null, triggeredByEmail);
        executor.execute(() -> runMembers(group, execution));
        return execution;
    }

    /** Scheduled trigger: runs inline on the schedule worker thread. */
    public ApiGroupExecution executeSync(ApiGroup group, Long scheduleId) {
        ApiGroupExecution execution = start(group, ApiGroupExecution.TriggeredBy.SCHEDULE, scheduleId, null);
        runMembers(group, execution);
        return executionRepository.findById(execution.getId()).orElse(execution);
    }

    private ApiGroupExecution start(ApiGroup group, ApiGroupExecution.TriggeredBy trigger, Long scheduleId,
                                    String triggeredByEmail) {
        List<ApiGroupMember> members = memberRepository.findByGroupIdOrderBySeqAsc(group.getId());
        ApiGroupExecution execution = new ApiGroupExecution();
        execution.setGroupId(group.getId());
        execution.setProjectId(group.getProjectId());
        execution.setCorrelationId(UUID.randomUUID().toString());
        execution.setTriggeredBy(trigger);
        execution.setScheduleId(scheduleId);
        execution.setTriggeredByEmail(triggeredByEmail);
        execution.setTotalApis(members.size());
        return executionRepository.save(execution);
    }

    private void runMembers(ApiGroup group, ApiGroupExecution execution) {
        List<ApiGroupMember> members = memberRepository.findByGroupIdOrderBySeqAsc(group.getId());
        int passed = 0;
        int failed = 0;
        ExecutionHistory.TriggeredBy trigger = execution.getTriggeredBy() == ApiGroupExecution.TriggeredBy.SCHEDULE
                ? ExecutionHistory.TriggeredBy.SCHEDULE
                : ExecutionHistory.TriggeredBy.MANUAL;

        log.info("group execution started groupId={} executionId={} correlationId={} members={}",
                group.getId(), execution.getId(), execution.getCorrelationId(), members.size());

        // One context for the whole group run — not one per member — so a Base
        // or Regular dependency shared by several members (e.g. every step
        // after "create land" needing that same land's en_id) actually executes
        // once and gets cached/reused, exactly as ExecutionContext's own
        // contract promises. A fresh per-member context silently defeats that
        // cache, forcing "create land" style writes to re-run once per
        // downstream member — confirmed live 2026-08-21 (the draft-creation
        // Regular API re-ran 7 extra times in one 9-member group).
        ExecutionContext context = ExecutionContext.builder()
                .groupId(group.getId())
                .groupExecutionId(execution.getId())
                .correlationId(execution.getCorrelationId())
                .build();

        for (ApiGroupMember member : members) {
            try {
                RegularApi api = regularApiRepository.findById(member.getRegularApiId()).orElse(null);
                if (api == null) {
                    log.warn("group member api {} no longer exists — counted as failed", member.getRegularApiId());
                    failed++;
                    continue;
                }
                var result = dependencyExecutionService.execute(api, trigger, execution.getScheduleId(), context);
                ExecutionResponse response = result.getResponse();
                boolean httpOk = response.isSuccess()
                        && response.getStatusCode() != null && response.getStatusCode() < 400;
                boolean validationOk = result.getValidationPassed() == null || result.getValidationPassed();
                if (httpOk && validationOk) {
                    passed++;
                    // A member that succeeds as a direct step is exactly as
                    // reusable as one resolved purely as a dependency — cache
                    // it the same way so a later member needing this same
                    // API's response (e.g. every step after "create land"
                    // needing that land's id) reuses this result instead of
                    // re-running a write it already ran. Without this, only
                    // dependency-resolved calls got cached, so the first
                    // downstream dependent still re-triggered a fresh (and,
                    // for a create/write endpoint, often now-invalid — e.g.
                    // duplicate-name-rejected) re-execution. Confirmed live
                    // 2026-08-21.
                    context.getRegularApiCache().put(api.getId(), response.getBody());
                } else {
                    failed++;
                }
            } catch (Exception ex) {
                log.error("group member {} crashed: {}", member.getRegularApiId(), ex.getMessage(), ex);
                failed++;
            }
        }

        execution.setPassedApis(passed);
        execution.setFailedApis(failed);
        int total = Math.max(execution.getTotalApis(), passed + failed);
        execution.setHealthPercent(total == 0 ? 100.0 : Math.round(passed * 1000.0 / total) / 10.0);
        execution.setStatus(failed == 0 ? ApiGroupExecution.Status.SUCCESS
                : passed == 0 ? ApiGroupExecution.Status.FAILED
                : ApiGroupExecution.Status.PARTIAL);
        execution.setFinishedAt(Instant.now());
        executionRepository.save(execution);

        log.info("group execution finished groupId={} executionId={} status={} passed={} failed={} health={}%",
                group.getId(), execution.getId(), execution.getStatus(), passed, failed, execution.getHealthPercent());

        emailReport(group, execution);
    }

    /** Report + email are best-effort: any failure here must never change the group's own
     * recorded pass/fail result, so everything is caught and only logged. A manual run emails
     * nothing unless the group opts in — scheduled runs already opt in via their recipients. */
    private void emailReport(ApiGroup group, ApiGroupExecution execution) {
        try {
            List<String> recipients;
            if (execution.getTriggeredBy() == ApiGroupExecution.TriggeredBy.SCHEDULE) {
                Schedule schedule = execution.getScheduleId() == null ? null
                        : scheduleRepository.findById(execution.getScheduleId()).orElse(null);
                recipients = schedule == null || schedule.getRecipients() == null
                        ? List.of() : Arrays.stream(schedule.getRecipients().split(",")).map(String::trim).toList();
            } else if (!group.isEmailReport()) {
                return;
            } else {
                recipients = execution.getTriggeredByEmail() == null ? List.of() : List.of(execution.getTriggeredByEmail());
            }
            if (recipients.isEmpty()) {
                log.warn("No report recipients for group execution {} — skipping email", execution.getId());
                return;
            }
            ReportData data = reportService.buildForGroupExecution(execution.getId());
            String subject = "Execution Report — Group \"" + group.getName() + "\" (" + execution.getStatus() + ")";
            String html = "<p>Group <b>" + group.getName() + "</b> finished with status <b>" + execution.getStatus()
                    + "</b> (" + execution.getPassedApis() + "/" + execution.getTotalApis() + " passed). "
                    + "Full report attached (PDF + Markdown).</p>";
            mailClient.send(recipients, subject, html, pdfRenderer.render(data), markdownRenderer.render(data).getBytes());
            execution.setReportEmailSentAt(Instant.now());
            executionRepository.save(execution);
        } catch (Exception e) {
            log.error("Failed to build/send report for group execution {}: {}", execution.getId(), e.getMessage(), e);
        }
    }
}
