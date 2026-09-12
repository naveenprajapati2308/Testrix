package com.automationportal.reports;

import com.automationportal.common.ApiResponse;
import com.automationportal.config.PortalAutomationProperties;
import com.automationportal.executions.*;
import com.automationportal.security.CurrentProjectService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.view.RedirectView;

import java.io.File;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/reports")
public class ReportController {
    private final ExecutionRepository executionRepository;
    private final ExecutionArtifactRepository artifactRepository;
    private final ExecutionTestCaseRepository testCaseRepository;
    private final PortalAutomationProperties properties;
    private final CurrentProjectService currentProjectService;

    public ReportController(ExecutionRepository executionRepository,
                            ExecutionArtifactRepository artifactRepository,
                            ExecutionTestCaseRepository testCaseRepository,
                            PortalAutomationProperties properties,
                            CurrentProjectService currentProjectService) {
        this.executionRepository = executionRepository;
        this.artifactRepository = artifactRepository;
        this.testCaseRepository = testCaseRepository;
        this.properties = properties;
        this.currentProjectService = currentProjectService;
    }

    @GetMapping
    public ApiResponse<List<Execution>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String framework,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        Instant fromInstant = (from != null && !from.trim().isEmpty()) ? Instant.parse(from) : null;
        Instant toInstant = (to != null && !to.trim().isEmpty()) ? Instant.parse(to) : null;
        Long projectId = currentProjectService.requireProjectId();

        List<Execution> list = executionRepository.findAll().stream()
                .filter(e -> projectId.equals(e.getProjectId()))
                .filter(e -> e.getStatus() != ExecutionStatus.QUEUED && e.getStatus() != ExecutionStatus.RUNNING)
                .filter(e -> status == null || status.trim().isEmpty() || e.getStatus().toString().equalsIgnoreCase(status))
                .filter(e -> module == null || module.trim().isEmpty() || (e.getModuleCode() != null && e.getModuleCode().equalsIgnoreCase(module)))
                .filter(e -> framework == null || framework.trim().isEmpty() || (e.getFramework() != null && e.getFramework().equalsIgnoreCase(framework)))
                .filter(e -> search == null || search.trim().isEmpty() || e.getExecutionCode().toLowerCase().contains(search.toLowerCase()))
                .filter(e -> fromInstant == null || (e.getCreatedAt() != null && e.getCreatedAt().isAfter(fromInstant)))
                .filter(e -> toInstant == null || (e.getCreatedAt() != null && e.getCreatedAt().isBefore(toInstant)))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .collect(Collectors.toList());

        return ApiResponse.ok(list);
    }

    @GetMapping("/{executionId}")
    public ApiResponse<Execution> getReportDetails(@PathVariable Long executionId) {
        return ApiResponse.ok(requireExecutionAccess(executionId));
    }

    @GetMapping("/{executionId}/view")
    public RedirectView viewReport(@PathVariable Long executionId) {
        Execution e = requireExecutionAccess(executionId);
        String reportPath = e.getFinalReportPath();
        if (reportPath == null || reportPath.trim().isEmpty()) {
            throw new IllegalArgumentException("No final Extent report generated for this execution.");
        }
        return new RedirectView("/uploads/" + reportPath);
    }

    @GetMapping("/{executionId}/download")
    public ResponseEntity<Resource> downloadReport(@PathVariable Long executionId) {
        Execution e = requireExecutionAccess(executionId);
        String reportPath = e.getFinalReportPath();
        if (reportPath == null || reportPath.trim().isEmpty()) {
            throw new IllegalArgumentException("No final report available for download.");
        }
        File file = Path.of(properties.getArtifactsRoot(), reportPath).toFile();
        if (!file.exists()) {
            throw new IllegalArgumentException("Report file does not exist on disk.");
        }
        Resource resource = new FileSystemResource(file);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.getName() + "\"")
                .body(resource);
    }

    @GetMapping("/{executionId}/testng-results")
    public ResponseEntity<Resource> downloadTestNgResults(@PathVariable Long executionId) {
        requireExecutionAccess(executionId);
        List<ExecutionArtifact> list = artifactRepository.findByExecutionIdAndArtifactType(executionId, "TESTNG_RESULTS_XML");
        if (list.isEmpty()) {
            throw new IllegalArgumentException("testng-results.xml artifact not found for this execution.");
        }
        ExecutionArtifact artifact = list.get(0);
        File file = Path.of(properties.getArtifactsRoot(), artifact.getFilePath()).toFile();
        if (!file.exists()) {
            throw new IllegalArgumentException("testng-results.xml file does not exist on disk.");
        }
        Resource resource = new FileSystemResource(file);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_XML)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.getName() + "\"")
                .body(resource);
    }

    @GetMapping("/{executionId}/failed-tests")
    public ApiResponse<List<ExecutionTestCase>> getFailedTests(@PathVariable Long executionId) {
        requireExecutionAccess(executionId);
        List<ExecutionTestCase> failed = testCaseRepository.findByExecutionIdAndStatusWithTags(executionId, "FAIL");
        return ApiResponse.ok(failed);
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
