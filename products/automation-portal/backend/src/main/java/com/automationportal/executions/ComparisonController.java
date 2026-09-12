package com.automationportal.executions;

import com.automationportal.common.ApiResponse;
import com.automationportal.security.CurrentProjectService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/compare")
public class ComparisonController {
    private final ExecutionRepository executionRepository;
    private final ExecutionTestCaseRepository testCaseRepository;
    private final CurrentProjectService currentProjectService;

    public ComparisonController(ExecutionRepository executionRepository,
                                ExecutionTestCaseRepository testCaseRepository,
                                CurrentProjectService currentProjectService) {
        this.executionRepository = executionRepository;
        this.testCaseRepository = testCaseRepository;
        this.currentProjectService = currentProjectService;
    }

    public record ExecutionBriefDto(
        String executionCode,
        BigDecimal passRate,
        int failed,
        int passed,
        int total
    ) {}

    public record DeltaDto(
        BigDecimal passRateChange,
        int newFailures,
        int fixedFailures,
        int stillFailing
    ) {}

    public record TestComparisonDto(
        String className,
        String methodName,
        String parameters,
        String baseStatus,
        String targetStatus,
        String failureReason
    ) {}

    public record ComparisonResultDto(
        ExecutionBriefDto base,
        ExecutionBriefDto target,
        DeltaDto delta,
        List<TestComparisonDto> newFailures,
        List<TestComparisonDto> fixedTests,
        List<TestComparisonDto> statusChangedTests
    ) {}

    @GetMapping("/executions")
    public ApiResponse<ComparisonResultDto> compareExecutions(
            @RequestParam Long baseExecutionId,
            @RequestParam Long targetExecutionId) {

        Execution baseExec = requireExecutionAccess(baseExecutionId);
        Execution targetExec = requireExecutionAccess(targetExecutionId);

        List<ExecutionTestCase> baseCases = testCaseRepository.findByExecutionId(baseExecutionId).stream()
                .filter(tc -> !tc.isConfigMethod())
                .collect(Collectors.toList());
        List<ExecutionTestCase> targetCases = testCaseRepository.findByExecutionId(targetExecutionId).stream()
                .filter(tc -> !tc.isConfigMethod())
                .collect(Collectors.toList());

        Map<String, ExecutionTestCase> baseMap = baseCases.stream()
                .collect(Collectors.toMap(
                        tc -> getTestCaseKey(tc),
                        tc -> tc,
                        (p1, p2) -> p1
                ));

        Map<String, ExecutionTestCase> targetMap = targetCases.stream()
                .collect(Collectors.toMap(
                        tc -> getTestCaseKey(tc),
                        tc -> tc,
                        (p1, p2) -> p1
                ));

        List<TestComparisonDto> newFailures = new ArrayList<>();
        List<TestComparisonDto> fixedTests = new ArrayList<>();
        List<TestComparisonDto> statusChangedTests = new ArrayList<>();

        int stillFailing = 0;

        for (ExecutionTestCase targetCase : targetCases) {
            String key = getTestCaseKey(targetCase);
            ExecutionTestCase baseCase = baseMap.get(key);

            if (baseCase != null) {
                String baseStatus = baseCase.getStatus();
                String targetStatus = targetCase.getStatus();

                if (!baseStatus.equalsIgnoreCase(targetStatus)) {
                    TestComparisonDto comp = new TestComparisonDto(
                            targetCase.getClassName(),
                            targetCase.getMethodName(),
                            targetCase.getParameters(),
                            baseStatus,
                            targetStatus,
                            targetCase.getFailureReason()
                    );
                    statusChangedTests.add(comp);

                    if ("FAIL".equalsIgnoreCase(targetStatus) && "PASS".equalsIgnoreCase(baseStatus)) {
                        newFailures.add(comp);
                    } else if ("PASS".equalsIgnoreCase(targetStatus) && "FAIL".equalsIgnoreCase(baseStatus)) {
                        fixedTests.add(comp);
                    }
                } else {
                    if ("FAIL".equalsIgnoreCase(targetStatus)) {
                        stillFailing++;
                    }
                }
            } else {
                // Newly added test case in target
                if ("FAIL".equalsIgnoreCase(targetCase.getStatus())) {
                    TestComparisonDto comp = new TestComparisonDto(
                            targetCase.getClassName(),
                            targetCase.getMethodName(),
                            targetCase.getParameters(),
                            "NEW_TEST",
                            targetCase.getStatus(),
                            targetCase.getFailureReason()
                    );
                    newFailures.add(comp);
                }
            }
        }

        BigDecimal passRateChange = targetExec.getPassRate().subtract(baseExec.getPassRate());

        ExecutionBriefDto baseBrief = new ExecutionBriefDto(
                baseExec.getExecutionCode(),
                baseExec.getPassRate(),
                baseExec.getFailedTests(),
                baseExec.getPassedTests(),
                baseExec.getTotalTests()
        );

        ExecutionBriefDto targetBrief = new ExecutionBriefDto(
                targetExec.getExecutionCode(),
                targetExec.getPassRate(),
                targetExec.getFailedTests(),
                targetExec.getPassedTests(),
                targetExec.getTotalTests()
        );

        DeltaDto delta = new DeltaDto(
                passRateChange,
                newFailures.size(),
                fixedTests.size(),
                stillFailing
        );

        return ApiResponse.ok(new ComparisonResultDto(
                baseBrief,
                targetBrief,
                delta,
                newFailures,
                fixedTests,
                statusChangedTests
        ));
    }

    @GetMapping("/latest")
    public ApiResponse<ComparisonResultDto> compareLatest(@RequestParam String module) {
        Long projectId = currentProjectService.requireProjectId();
        List<Execution> execs = executionRepository.findAll().stream()
                .filter(e -> projectId.equals(e.getProjectId()))
                .filter(e -> module.equalsIgnoreCase(e.getModuleCode()))
                .filter(e -> e.getStatus() != ExecutionStatus.QUEUED && e.getStatus() != ExecutionStatus.RUNNING)
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .collect(Collectors.toList());

        if (execs.size() < 2) {
            throw new IllegalArgumentException("Not enough executions for module " + module + " to perform comparison.");
        }

        return compareExecutions(execs.get(1).getId(), execs.get(0).getId());
    }

    private String getTestCaseKey(ExecutionTestCase tc) {
        return tc.getClassName() + "#" + tc.getMethodName() + "#" + (tc.getParameters() != null ? tc.getParameters() : "");
    }

    private Execution requireExecutionAccess(Long executionId) {
        Execution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found: " + executionId));
        if (!currentProjectService.canAccess(execution.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found: " + executionId);
        }
        return execution;
    }
}
