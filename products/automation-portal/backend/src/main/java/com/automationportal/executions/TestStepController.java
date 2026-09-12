package com.automationportal.executions;

import com.automationportal.common.ApiResponse;
import com.automationportal.security.CurrentProjectService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/test-cases")
public class TestStepController {

    private final TestStepRepository testStepRepository;
    private final ExecutionTestCaseRepository testCaseRepository;
    private final ExecutionRepository executionRepository;
    private final CurrentProjectService currentProjectService;

    public TestStepController(TestStepRepository testStepRepository,
                               ExecutionTestCaseRepository testCaseRepository,
                               ExecutionRepository executionRepository,
                               CurrentProjectService currentProjectService) {
        this.testStepRepository = testStepRepository;
        this.testCaseRepository = testCaseRepository;
        this.executionRepository = executionRepository;
        this.currentProjectService = currentProjectService;
    }

    @GetMapping("/{testCaseId}/steps")
    public ApiResponse<List<TestStep>> getSteps(@PathVariable Long testCaseId) {
        ExecutionTestCase testCase = testCaseRepository.findById(testCaseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test case not found: " + testCaseId));
        Execution execution = executionRepository.findById(testCase.getExecutionId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test case not found: " + testCaseId));
        if (!currentProjectService.canAccess(execution.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Test case not found: " + testCaseId);
        }
        return ApiResponse.ok(testStepRepository.findByTestCaseIdOrderByStepOrder(testCaseId));
    }
}
