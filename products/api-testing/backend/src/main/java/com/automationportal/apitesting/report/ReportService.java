package com.automationportal.apitesting.report;

import com.automationportal.apitesting.group.ApiGroup;
import com.automationportal.apitesting.group.ApiGroupExecution;
import com.automationportal.apitesting.group.ApiGroupExecutionRepository;
import com.automationportal.apitesting.group.ApiGroupRepository;
import com.automationportal.apitesting.history.BodyStore;
import com.automationportal.apitesting.history.ExecutionHistory;
import com.automationportal.apitesting.history.ExecutionHistoryRepository;
import com.automationportal.apitesting.validation.BusinessValidationService;
import com.automationportal.apitesting.validation.ValidationResultRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Assembles a {@link ReportData} from data that's already captured on every execution —
 * ExecutionHistory (full request/response) and ValidationResult (per-rule pass/fail). No new
 * storage: a report is a read/aggregation view, generated on demand for both email and download.
 */
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ExecutionHistoryRepository historyRepository;
    private final ValidationResultRepository validationResultRepository;
    private final BodyStore bodyStore;
    private final ApiGroupExecutionRepository executionRepository;
    private final ApiGroupRepository groupRepository;
    private final BusinessValidationService businessValidationService;

    public ReportData buildForHistory(Long executionHistoryId) {
        ExecutionHistory h = historyRepository.findById(executionHistoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found"));
        ApiCallBlock block = toBlock(h);
        boolean passed = isPassed(h);

        ReportData data = new ReportData();
        data.setReportType("SCHEDULE_API");
        data.setTargetName(h.getApiName());
        data.setStatus(passed ? "SUCCESS" : "FAILED");
        data.setTriggeredBy(h.getTriggeredBy().name());
        data.setStartedAt(h.getStartedAt());
        data.setFinishedAt(h.getFinishedAt());
        data.setTotalApis(1);
        data.setPassedApis(passed ? 1 : 0);
        data.setFailedApis(passed ? 0 : 1);
        data.setHealthPercent(passed ? 100.0 : 0.0);
        data.setCalls(List.of(block));
        return data;
    }

    public ReportData buildForGroupExecution(Long groupExecutionId) {
        ApiGroupExecution execution = executionRepository.findById(groupExecutionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group execution not found"));
        List<ExecutionHistory> rows = historyRepository.findByGroupExecutionIdOrderByExecutedAtAsc(groupExecutionId);

        ReportData data = new ReportData();
        data.setReportType("GROUP");
        data.setTargetName(groupRepository.findById(execution.getGroupId()).map(ApiGroup::getName).orElse("(deleted)"));
        data.setStatus(execution.getStatus().name());
        data.setTriggeredBy(execution.getTriggeredBy().name());
        data.setTriggeredByEmail(execution.getTriggeredByEmail());
        data.setStartedAt(execution.getStartedAt());
        data.setFinishedAt(execution.getFinishedAt());
        data.setTotalApis(execution.getTotalApis());
        data.setPassedApis(execution.getPassedApis());
        data.setFailedApis(execution.getFailedApis());
        data.setHealthPercent(execution.getHealthPercent());
        data.setCalls(rows.stream().map(this::toBlock).toList());
        return data;
    }

    private boolean isPassed(ExecutionHistory h) {
        boolean httpOk = h.getResponseStatusCode() != null && h.getResponseStatusCode() < 400
                && h.getErrorMessage() == null;
        boolean validationOk = h.getValidationPassed() == null || h.getValidationPassed();
        return httpOk && validationOk;
    }

    private ApiCallBlock toBlock(ExecutionHistory h) {
        ApiCallBlock b = new ApiCallBlock();
        b.setName(h.getApiName());
        b.setMethod(h.getRequestMethod());
        b.setUrl(h.getRequestUrl());
        b.setRequestHeaders(h.getRequestHeaders());
        b.setRequestBody(h.getRequestBody());
        b.setInjectedVariables(h.getInjectedVariables());
        b.setResponseStatusCode(h.getResponseStatusCode());
        b.setResponseStatusMessage(h.getResponseStatusMessage());
        b.setResponseHeaders(h.getResponseHeaders());
        b.setResponseBody(h.getResponseBodyInline() != null ? h.getResponseBodyInline()
                : (h.getResponseBodyObjectKey() != null ? bodyStore.load(h.getResponseBodyObjectKey()) : null));
        b.setResponseSizeBytes(h.getResponseSizeBytes());
        b.setTotalTimeMs(h.getTotalTimeMs());
        b.setValidationPassed(h.getValidationPassed());
        b.setErrorMessage(h.getErrorMessage());
        b.setValidationResults(validationResultRepository.findViewsByExecutionId(h.getId()));
        b.setRequiredFieldResults(businessValidationService.findByExecutionHistoryId(h.getId()));
        return b;
    }
}
