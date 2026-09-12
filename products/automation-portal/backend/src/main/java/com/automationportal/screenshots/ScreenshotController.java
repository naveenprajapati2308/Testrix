package com.automationportal.screenshots;

import com.automationportal.common.ApiResponse;
import com.automationportal.config.PortalAutomationProperties;
import com.automationportal.executions.*;
import com.automationportal.security.CurrentProjectService;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/screenshots")
public class ScreenshotController {
    private static final Logger log = LoggerFactory.getLogger(ScreenshotController.class);

    private final ExecutionTestCaseRepository testCaseRepository;
    private final ExecutionRepository executionRepository;
    private final ExecutionArtifactRepository artifactRepository;
    private final PortalAutomationProperties automationProperties;
    private final CurrentProjectService currentProjectService;

    public ScreenshotController(ExecutionTestCaseRepository testCaseRepository,
                                ExecutionRepository executionRepository,
                                ExecutionArtifactRepository artifactRepository,
                                PortalAutomationProperties automationProperties,
                                CurrentProjectService currentProjectService) {
        this.testCaseRepository = testCaseRepository;
        this.executionRepository = executionRepository;
        this.artifactRepository = artifactRepository;
        this.automationProperties = automationProperties;
        this.currentProjectService = currentProjectService;
    }

    public record ScreenshotDto(
        Long testCaseId,
        Long executionId,
        String executionCode,
        String moduleCode,
        String testName,
        String methodName,
        String screenshotPath,
        String failureReason,
        Instant createdAt
    ) {}

    @GetMapping
    public ApiResponse<List<ScreenshotDto>> list(
            @RequestParam(required = false) Long executionId) {

        Long projectId = currentProjectService.requireProjectId();
        if (executionId != null) {
            Execution execution = executionRepository.findById(executionId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found: " + executionId));
            if (!currentProjectService.canAccess(execution.getProjectId())) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found: " + executionId);
            }
        }

        // Preload executions to avoid N+1 queries, and to resolve which executionIds are in
        // scope when no single executionId was requested.
        List<Execution> allExecutions = executionRepository.findAll();
        Map<Long, String> executionMap = allExecutions.stream()
                .collect(Collectors.toMap(Execution::getId, Execution::getExecutionCode, (p1, p2) -> p1));
        java.util.Set<Long> allowedExecutionIds = allExecutions.stream()
                .filter(e -> projectId.equals(e.getProjectId()))
                .map(Execution::getId)
                .collect(Collectors.toSet());

        List<ExecutionTestCase> cases = testCaseRepository.findAll().stream()
                .filter(tc -> tc.getScreenshotPath() != null && !tc.getScreenshotPath().trim().isEmpty())
                .filter(tc -> executionId == null || tc.getExecutionId().equals(executionId))
                .filter(tc -> allowedExecutionIds.contains(tc.getExecutionId()))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .collect(Collectors.toList());

        List<ScreenshotDto> dtos = new ArrayList<>();
        for (ExecutionTestCase tc : cases) {
            String code = executionMap.getOrDefault(tc.getExecutionId(), "AUTO-UNKNOWN");
            dtos.add(new ScreenshotDto(
                tc.getId(),
                tc.getExecutionId(),
                code,
                tc.getModuleCode(),
                tc.getTestName(),
                tc.getMethodName(),
                tc.getScreenshotPath(),
                tc.getFailureReason(),
                tc.getCreatedAt()
            ));
        }

        return ApiResponse.ok(dtos);
    }

    /**
     * Deletes the screenshot image belonging to a test case: removes the file from
     * the artifacts folder, the matching execution_artifacts row, and clears the
     * test case's screenshot_path. The test case row itself is kept.
     */
    @DeleteMapping("/{testCaseId}")
    @Transactional
    public ApiResponse<String> delete(@PathVariable Long testCaseId) throws IOException {
        ExecutionTestCase tc = testCaseRepository.findById(testCaseId)
                .orElseThrow(() -> new IllegalArgumentException("Screenshot not found for test case: " + testCaseId));
        Execution owningExecution = executionRepository.findById(tc.getExecutionId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Screenshot not found for test case: " + testCaseId));
        if (!currentProjectService.canAccess(owningExecution.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Screenshot not found for test case: " + testCaseId);
        }

        String screenshotPath = tc.getScreenshotPath();
        if (screenshotPath == null || screenshotPath.trim().isEmpty()) {
            throw new IllegalArgumentException("This test case has no screenshot to delete");
        }

        // Resolve inside the artifacts root only — reject any traversal outside it.
        Path root = Paths.get(automationProperties.getArtifactsRoot()).toAbsolutePath().normalize();
        Path file = root.resolve(screenshotPath).normalize();
        if (!file.startsWith(root)) {
            throw new IllegalArgumentException("Invalid screenshot path");
        }

        boolean fileDeleted = Files.deleteIfExists(file);
        if (!fileDeleted) {
            log.warn("Screenshot file already missing on disk: {}", file);
        }

        artifactRepository.deleteByExecutionIdAndFilePath(tc.getExecutionId(), screenshotPath);
        tc.setScreenshotPath(null);
        testCaseRepository.save(tc);

        return ApiResponse.ok("Screenshot deleted successfully");
    }
}
