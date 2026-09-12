package com.automationportal.executions;

import com.automationportal.security.CurrentUserService;
import com.automationportal.common.ApiResponse;
import com.automationportal.modules.ModuleRepository;
import com.automationportal.security.CurrentProjectService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/executions")
public class ExecutionController {
    private final ExecutionService service;
    private final ExecutionRepository repository;
    private final CurrentUserService currentUserService;
    private final CurrentProjectService currentProjectService;
    private final ModuleRepository moduleRepository;
    private final java.net.http.HttpClient httpClient;

    @org.springframework.beans.factory.annotation.Value("${portal.execution-manager.url:http://localhost:8090}")
    private String executionManagerUrl;

    @org.springframework.beans.factory.annotation.Value("${portal.events.api-key}")
    private String expectedApiKey;

    private boolean isValidApiKey(String apiKey) {
        return expectedApiKey == null || expectedApiKey.isEmpty() || expectedApiKey.equals(apiKey);
    }

    public ExecutionController(ExecutionService service, ExecutionRepository repository,
                                CurrentUserService currentUserService,
                                CurrentProjectService currentProjectService,
                                ModuleRepository moduleRepository) {
        this.service = service;
        this.repository = repository;
        this.currentUserService = currentUserService;
        this.currentProjectService = currentProjectService;
        this.moduleRepository = moduleRepository;
        this.httpClient = java.net.http.HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(5))
                .build();
    }

    @PostMapping("/run")
    public ApiResponse<Execution> run(@Valid @RequestBody RunExecutionRequest request) {
        return ApiResponse.created("Execution queued", service.queue(request, currentUserService.currentUser().id()));
    }

    @GetMapping
    public ApiResponse<List<Execution>> recent(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String framework,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        Instant fromInstant = (from != null && !from.trim().isEmpty()) ? Instant.parse(from) : null;
        Instant toInstant = (to != null && !to.trim().isEmpty()) ? Instant.parse(to) : null;

        if (status == null && module == null && framework == null && fromInstant == null && toInstant == null) {
            return ApiResponse.ok(service.recent());
        }
        return ApiResponse.ok(service.filter(status, module, framework, fromInstant, toInstant));
    }

    @GetMapping("/{id}")
    public ApiResponse<Execution> get(@PathVariable Long id) {
        Execution execution = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found: " + id));
        if (!currentProjectService.canAccess(execution.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found: " + id);
        }
        return ApiResponse.ok(execution);
    }

    @GetMapping("/{id}/test-cases")
    public ApiResponse<List<ExecutionTestCase>> getTestCases(@PathVariable Long id) {
        return ApiResponse.ok(service.getTestCases(id));
    }

    @GetMapping("/{id}/artifacts")
    public ApiResponse<List<ExecutionArtifact>> getArtifacts(@PathVariable Long id) {
        return ApiResponse.ok(service.getArtifacts(id));
    }

    @GetMapping("/{id}/logs")
    public ApiResponse<List<ExecutionLog>> getLogs(@PathVariable Long id) {
        return ApiResponse.ok(service.getLogs(id));
    }

    @GetMapping("/{id}/summary")
    public ApiResponse<Map<String, Object>> getSummary(@PathVariable Long id) {
        return ApiResponse.ok(service.getSummary(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/cancel")
    public ApiResponse<Void> cancel(@PathVariable Long id) {
        service.cancel(id);
        return ApiResponse.created("Execution cancellation requested", null);
    }

    @PostMapping("/{id}/rerun")
    public ApiResponse<Execution> rerun(@PathVariable Long id) {
        return ApiResponse.created("Execution rerun queued", service.rerun(id, currentUserService.currentUser().id()));
    }

    @PostMapping("/{id}/rerun-failed")
    public ApiResponse<Execution> rerunFailed(@PathVariable Long id) {
        return ApiResponse.created("Failed tests rerun queued", service.rerunFailed(id, currentUserService.currentUser().id()));
    }

    @PostMapping("/{id}/state")
    public org.springframework.http.ResponseEntity<ApiResponse<Void>> updateState(
            @PathVariable Long id,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey,
            @RequestBody Map<String, String> body) {
        if (!isValidApiKey(apiKey)) {
            return org.springframework.http.ResponseEntity.status(401).body(ApiResponse.error("Invalid or missing X-API-Key header"));
        }
        String state = body.get("state");
        service.updateState(id, state);
        return org.springframework.http.ResponseEntity.ok(ApiResponse.ok(null));
    }

    @PostMapping("/{id}/job-finished")
    public org.springframework.http.ResponseEntity<ApiResponse<Void>> jobFinished(
            @PathVariable Long id,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        if (!isValidApiKey(apiKey)) {
            return org.springframework.http.ResponseEntity.status(401).body(ApiResponse.error("Invalid or missing X-API-Key header"));
        }
        service.markStaleIfStillRunning(id);
        return org.springframework.http.ResponseEntity.ok(ApiResponse.ok(null));
    }

    // The runner only ever mounts ONE shared framework checkout per engine type today (no
    // per-project isolation yet — see docs/automation-framework-connection.md and
    // docs/framework-lifecycle-architecture.md for the target design). Proxying this unscoped
    // would let ANY project browse and run a suite from another project's real, unrelated
    // codebase (e.g. a brand-new project seeing/launching MPHIDB's actual test specs) — a real
    // cross-tenant leak, not a hypothetical one. Until per-project framework directories exist,
    // the only project(s) with a legitimate claim on the shared checkout are ones an admin has
    // already, deliberately wired a Module into (docs' "interim, manual" onboarding step) — so
    // gate on that instead of proxying unconditionally.
    @GetMapping("/runner/suites")
    public ApiResponse<Object> getRunnerSuites(
            @RequestParam(defaultValue = "MAVEN_TESTNG") String framework) {
        Long projectId = currentProjectService.requireProjectId();
        if (moduleRepository.findByProjectIdAndRunnerType(projectId, framework).isEmpty()) {
            return ApiResponse.ok(List.of());
        }
        try {
            String url = executionManagerUrl + "/em/suites?framework=" + framework;
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url))
                    .GET()
                    .timeout(java.time.Duration.ofSeconds(5))
                    .build();
            java.net.http.HttpResponse<String> response = httpClient.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return ApiResponse.error("Unable to load suites from the execution runner (status " + response.statusCode() + ")");
            }
            Object suites = new com.fasterxml.jackson.databind.ObjectMapper().readValue(response.body(), Object.class);
            return ApiResponse.ok(suites);
        } catch (Exception e) {
            return ApiResponse.error("Unable to load suites from the execution runner: " + e.getMessage());
        }
    }
}
