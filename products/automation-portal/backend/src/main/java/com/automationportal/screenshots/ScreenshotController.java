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
import java.util.Optional;
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
        Long id,
        Long testCaseId,
        Long executionId,
        String executionCode,
        String moduleCode,
        String testName,
        String methodName,
        String screenshotPath,
        String failureReason,
        Instant createdAt,
        String mediaType
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

        // Preload executions to avoid N+1 queries, and to resolve which executionIds are in scope
        List<Execution> allExecutions = executionRepository.findAll();
        Map<Long, Execution> executionEntityMap = allExecutions.stream()
                .collect(Collectors.toMap(Execution::getId, e -> e, (e1, e2) -> e1));
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
            Execution exec = executionEntityMap.get(tc.getExecutionId());
            String code = exec != null ? exec.getExecutionCode() : "AUTO-UNKNOWN";
            dtos.add(new ScreenshotDto(
                tc.getId(),
                tc.getId(),
                tc.getExecutionId(),
                code,
                tc.getModuleCode(),
                tc.getTestName(),
                tc.getMethodName(),
                tc.getScreenshotPath(),
                tc.getFailureReason(),
                tc.getCreatedAt(),
                "IMAGE"
            ));
        }

        // Include Video recordings from execution artifacts
        List<ExecutionArtifact> videos = artifactRepository.findAll().stream()
                .filter(art -> "VIDEO".equalsIgnoreCase(art.getArtifactType()))
                .filter(art -> art.getFilePath() != null && !art.getFilePath().isBlank())
                .filter(art -> executionId == null || art.getExecutionId().equals(executionId))
                .filter(art -> allowedExecutionIds.contains(art.getExecutionId()))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .collect(Collectors.toList());

        for (ExecutionArtifact vid : videos) {
            Execution exec = executionEntityMap.get(vid.getExecutionId());
            String code = exec != null ? exec.getExecutionCode() : "AUTO-UNKNOWN";
            String mod = exec != null ? exec.getModuleCode() : null;
            dtos.add(new ScreenshotDto(
                vid.getId(),
                null,
                vid.getExecutionId(),
                code,
                mod,
                vid.getFileName(),
                "Recording — " + vid.getFileName(),
                vid.getFilePath(),
                "Playwright Video Recording (.webm)",
                vid.getCreatedAt(),
                "VIDEO"
            ));
        }

        dtos.sort((a, b) -> b.createdAt().compareTo(a.createdAt()));
        return ApiResponse.ok(dtos);
    }

    /**
     * Deletes a screenshot or video media item from disk and repository.
     */
    @DeleteMapping("/{id}")
    @Transactional
    public ApiResponse<String> delete(@PathVariable Long id) throws IOException {
        Optional<ExecutionTestCase> tcOpt = testCaseRepository.findById(id);
        if (tcOpt.isPresent()) {
            ExecutionTestCase tc = tcOpt.get();
            Execution owningExecution = executionRepository.findById(tc.getExecutionId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Screenshot not found for test case: " + id));
            if (!currentProjectService.canAccess(owningExecution.getProjectId())) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Screenshot not found for test case: " + id);
            }

            String screenshotPath = tc.getScreenshotPath();
            if (screenshotPath != null && !screenshotPath.trim().isEmpty()) {
                Path root = Paths.get(automationProperties.getArtifactsRoot()).toAbsolutePath().normalize();
                Path file = root.resolve(screenshotPath).normalize();
                if (file.startsWith(root)) {
                    Files.deleteIfExists(file);
                }
                artifactRepository.deleteByExecutionIdAndFilePath(tc.getExecutionId(), screenshotPath);
                tc.setScreenshotPath(null);
                testCaseRepository.save(tc);
            }
            return ApiResponse.ok("Screenshot deleted successfully");
        }

        ExecutionArtifact artifact = artifactRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Media item not found: " + id));
        Execution owningExecution = executionRepository.findById(artifact.getExecutionId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found for media"));
        if (!currentProjectService.canAccess(owningExecution.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Media item not found: " + id);
        }

        Path root = Paths.get(automationProperties.getArtifactsRoot()).toAbsolutePath().normalize();
        Path file = root.resolve(artifact.getFilePath()).normalize();
        if (file.startsWith(root)) {
            Files.deleteIfExists(file);
        }
        artifactRepository.delete(artifact);
        return ApiResponse.ok("Media item deleted successfully");
    }
}
