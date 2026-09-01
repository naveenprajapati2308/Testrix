package com.automationportal.apitesting.history;

import com.automationportal.apitesting.security.CurrentProjectService;
import com.automationportal.apitesting.validation.BusinessValidationService;
import com.automationportal.apitesting.validation.FieldValidationResult;
import com.automationportal.apitesting.validation.ValidationResultRepository;
import com.automationportal.apitesting.validation.ValidationResultView;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/v1/history")
@RequiredArgsConstructor
public class HistoryController {

    private final ExecutionHistoryRepository repository;
    private final ValidationResultRepository validationResultRepository;
    private final BodyStore bodyStore;
    private final BusinessValidationService businessValidationService;
    private final CurrentProjectService currentProjectService;

    @GetMapping
    public Page<ExecutionHistory> list(
            @RequestParam(required = false) ExecutionHistory.ApiType apiType,
            @RequestParam(required = false) Long apiId,
            @RequestParam(required = false) Long moduleId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long scheduleId,
            @RequestParam(required = false) String method,
            @RequestParam(required = false) Long groupExecutionId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        // Browsing broadly (no specific group run or specific API picked): hide
        // the internal CHAIN_DEPENDENCY calls a Regular API's own dependency
        // chain makes — they'd otherwise flood this list with rows that aren't
        // a run anyone triggered themselves. Drilling into one group run
        // (groupExecutionId set) still shows its full chain, and "latest run
        // of this specific API" lookups (apiId set — group member rows,
        // per-schedule drill-down) still find an API that only ever runs as a
        // dependency, same as before.
        boolean topLevelOnly = groupExecutionId == null && apiId == null;
        Page<ExecutionHistory> result = repository.search(currentProjectService.requireProjectId(), apiType, apiId, moduleId,
                (status == null || status.isBlank()) ? null : status,
                scheduleId,
                (method == null || method.isBlank()) ? null : method.toUpperCase(),
                groupExecutionId, topLevelOnly, from, to, PageRequest.of(page, Math.min(size, 100)));
        // List rows stay light: bodies are only returned from the detail endpoint.
        result.forEach(h -> {
            h.setResponseBodyInline(null);
            h.setRequestBody(null);
            h.setResponseHeaders(null);
            h.setRequestHeaders(null);
            h.setInjectedVariables(null);
            h.setResponseCookies(null);
        });
        return result;
    }

    @Data
    public static class HistoryDetail {
        private ExecutionHistory execution;
        private String responseBody;
        private List<ValidationResultView> validationResults;
        private List<FieldValidationResult> requiredFieldResults;
    }

    @GetMapping("/{id}")
    public HistoryDetail detail(@PathVariable Long id) {
        ExecutionHistory h = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found"));
        if (!currentProjectService.requireProjectId().equals(h.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found");
        }
        HistoryDetail d = new HistoryDetail();
        d.setExecution(h);
        d.setResponseBody(h.getResponseBodyInline() != null
                ? h.getResponseBodyInline()
                : (h.getResponseBodyObjectKey() != null ? bodyStore.load(h.getResponseBodyObjectKey()) : null));
        d.setValidationResults(validationResultRepository.findViewsByExecutionId(id));
        d.setRequiredFieldResults(businessValidationService.findByExecutionHistoryId(id));
        return d;
    }
}
