package com.automationportal.testengine;

import com.automationportal.security.CurrentUserService;
import com.automationportal.common.ApiResponse;
import com.automationportal.common.EntityIdGeneratorService;
import com.automationportal.config.PortalAutomationProperties;
import com.automationportal.security.CurrentProjectService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Test Engine registration/management (docs/version2.3.md Plan 2). Register/update/disable and
 * credential rotate/revoke go through the normal JWT+project-context path (blanket
 * JwtAuthenticationFilter already blocks all-Viewer callers on every mutating verb, so "Viewer
 * must not register a Test Engine" needs no extra check here). /heartbeat is the one exception —
 * see SecurityConfig's permitAll list and its own X-API-Key self-validation below.
 */
@RestController
@RequestMapping("/api/test-engines")
public class TestEngineController {
    private final TestEngineRepository repository;
    private final TestEngineCredentialService credentialService;
    private final CurrentProjectService currentProjectService;
    private final CurrentUserService currentUserService;
    private final EntityIdGeneratorService entityIdGeneratorService;
    private final StarterKitService starterKitService;
    private final PortalAutomationProperties automationProperties;

    public TestEngineController(TestEngineRepository repository,
                                TestEngineCredentialService credentialService,
                                CurrentProjectService currentProjectService,
                                CurrentUserService currentUserService,
                                EntityIdGeneratorService entityIdGeneratorService,
                                StarterKitService starterKitService,
                                PortalAutomationProperties automationProperties) {
        this.repository = repository;
        this.credentialService = credentialService;
        this.currentProjectService = currentProjectService;
        this.currentUserService = currentUserService;
        this.entityIdGeneratorService = entityIdGeneratorService;
        this.starterKitService = starterKitService;
        this.automationProperties = automationProperties;
    }

    @GetMapping
    public ApiResponse<List<TestEngineDtos.Summary>> list() {
        Long projectId = currentProjectService.requireProjectId();
        return ApiResponse.ok(repository.findByProjectId(projectId).stream()
                .map(e -> TestEngineDtos.Summary.from(e, credentialService.activeKeyPrefix(e.getId()).orElse(null)))
                .toList());
    }

    /**
     * Non-secret, operational path — lets the Automation Setup Wizard tell the admin exactly
     * where to extract their downloaded starter kit ("<projectFrameworksRoot>\<a-name-you-choose>",
     * then register that name as this engine's frameworkPath).
     */
    @GetMapping("/config")
    public ApiResponse<Map<String, Object>> config() {
        currentProjectService.requireProjectId();
        return ApiResponse.ok(Map.of("projectFrameworksRoot",
                automationProperties.getProjectFrameworksRoot() != null ? automationProperties.getProjectFrameworksRoot() : ""));
    }

    @GetMapping("/{id}")
    public ApiResponse<TestEngineDtos.Summary> get(@PathVariable Long id) {
        TestEngine engine = findOwned(id);
        return ApiResponse.ok(TestEngineDtos.Summary.from(engine, credentialService.activeKeyPrefix(engine.getId()).orElse(null)));
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> register(@RequestBody TestEngineDtos.RegisterRequest body) {
        if (body.engineType() == null) throw new IllegalArgumentException("Engine type is required");
        if (body.name() == null || body.name().isBlank()) throw new IllegalArgumentException("Name is required");

        Long projectId = currentProjectService.requireProjectId();
        TestEngine engine = new TestEngine();
        engine.setBusinessId(entityIdGeneratorService.next(body.engineType().idPrefix()));
        engine.setProjectId(projectId);
        engine.setEngineType(body.engineType());
        engine.setName(body.name());
        engine.setDescription(body.description());
        engine.setDeploymentType(body.deploymentType() != null ? body.deploymentType() : DeploymentType.LOCAL);
        engine.setEndpoint(body.endpoint());
        engine.setFrameworkPath(validateFrameworkPath(body.frameworkPath()));
        engine.setReportPath(body.reportPath());
        engine.setCreatedByUserId(currentUserService.currentUser().id());
        repository.save(engine);

        TestEngineCredentialService.IssuedCredential issued = credentialService.issue(engine.getId());

        return ApiResponse.created("Test Engine registered — copy the key now, it will not be shown again", Map.of(
                "engine", TestEngineDtos.Summary.from(engine, issued.keyPrefix()),
                "credential", new TestEngineDtos.CredentialIssued(issued.plaintextKey(), issued.keyPrefix(), Instant.now())
        ));
    }

    @PutMapping("/{id}")
    public ApiResponse<TestEngineDtos.Summary> update(@PathVariable Long id, @RequestBody TestEngineDtos.UpdateRequest body) {
        TestEngine engine = findOwned(id);
        if (body.name() != null && !body.name().isBlank()) engine.setName(body.name());
        engine.setDescription(body.description());
        if (body.deploymentType() != null) engine.setDeploymentType(body.deploymentType());
        engine.setEndpoint(body.endpoint());
        engine.setFrameworkPath(validateFrameworkPath(body.frameworkPath()));
        engine.setReportPath(body.reportPath());
        repository.save(engine);
        return ApiResponse.ok(TestEngineDtos.Summary.from(engine, credentialService.activeKeyPrefix(engine.getId()).orElse(null)));
    }

    /**
     * frameworkPath is later joined server/container-side into
     * Paths.get(projectFrameworksRoot, frameworkPath) by the Framework Runner — a Project Admin
     * fully controls this value once the Setup Wizard exists, so it must only ever be able to
     * resolve to a direct subfolder of that root, never escape it.
     */
    private String validateFrameworkPath(String frameworkPath) {
        if (frameworkPath == null || frameworkPath.isBlank()) return frameworkPath;
        String trimmed = frameworkPath.trim();
        if (trimmed.contains("..") || trimmed.startsWith("/") || trimmed.startsWith("\\")
                || trimmed.matches("^[a-zA-Z]:.*")) {
            throw new IllegalArgumentException(
                    "Framework path must be a plain subfolder name under the project frameworks root — not an absolute path or '..'");
        }
        return trimmed;
    }

    /** Soft-disable, not delete — preserves the audit trail and any executions that reference it. */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> disable(@PathVariable Long id) {
        TestEngine engine = findOwned(id);
        engine.setStatus(EngineStatus.DISABLED);
        repository.save(engine);
        credentialService.revoke(engine.getId());
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/credential/rotate")
    public ApiResponse<TestEngineDtos.CredentialIssued> rotateCredential(@PathVariable Long id) {
        TestEngine engine = findOwned(id);
        TestEngineCredentialService.IssuedCredential issued = credentialService.rotate(engine.getId());
        if (engine.getStatus() == EngineStatus.DISABLED) {
            engine.setStatus(EngineStatus.REGISTERED);
            repository.save(engine);
        }
        return ApiResponse.ok(new TestEngineDtos.CredentialIssued(issued.plaintextKey(), issued.keyPrefix(), Instant.now()));
    }

    @PostMapping("/{id}/credential/revoke")
    public ApiResponse<Void> revokeCredential(@PathVariable Long id) {
        TestEngine engine = findOwned(id);
        credentialService.revoke(engine.getId());
        return ApiResponse.ok(null);
    }

    @GetMapping("/{id}/health")
    public ApiResponse<Map<String, Object>> health(@PathVariable Long id) {
        TestEngine engine = findOwned(id);
        TestEngineDtos.Summary summary = TestEngineDtos.Summary.from(engine, credentialService.activeKeyPrefix(engine.getId()).orElse(null));
        return ApiResponse.ok(Map.of(
                "status", engine.getStatus(),
                "health", summary.health(),
                "lastHeartbeatAt", engine.getLastHeartbeatAt() != null ? engine.getLastHeartbeatAt() : ""
        ));
    }

    /** Called by the engine itself, authenticated via its own credential — not a browser session. */
    @PostMapping("/{id}/heartbeat")
    public ApiResponse<Void> heartbeat(@PathVariable Long id, @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        TestEngine engine = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown Test Engine"));
        TestEngineCredential credential = credentialService.validate(apiKey)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or missing X-API-Key"));
        if (!credential.getTestEngineId().equals(engine.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Credential does not belong to this Test Engine");
        }
        engine.setLastHeartbeatAt(Instant.now());
        if (engine.getStatus() == EngineStatus.REGISTERED || engine.getStatus() == EngineStatus.OFFLINE) {
            engine.setStatus(EngineStatus.ACTIVE);
        }
        repository.save(engine);
        return ApiResponse.ok(null);
    }

    /**
     * A minimal, working reference project (see StarterKitService) with this engine's portal URL,
     * framework path, and report path already filled in. apiKey in the request body is optional —
     * the frontend only has a real one to send in the moment right after register/rotate, since
     * Testrix itself never stores or re-exposes the plaintext key afterward (§ Security & Credentials).
     */
    @PostMapping("/{id}/starter-kit")
    public void starterKit(@PathVariable Long id, @RequestBody(required = false) TestEngineDtos.StarterKitRequest body,
                           HttpServletResponse response) throws IOException {
        TestEngine engine = findOwned(id);
        String apiKey = (body != null && body.apiKey() != null && !body.apiKey().isBlank())
            ? body.apiKey() : "PASTE-YOUR-API-KEY-HERE";
        String portalUrl = (body != null && body.portalUrl() != null && !body.portalUrl().isBlank())
            ? body.portalUrl() : "";

        byte[] zip = starterKitService.build(engine.getEngineType(), Map.of(
            "PORTAL_URL", portalUrl,
            "API_KEY", apiKey,
            "FRAMEWORK_PATH", engine.getFrameworkPath() != null ? engine.getFrameworkPath() : "",
            "REPORT_PATH", engine.getReportPath() != null ? engine.getReportPath() : ""
        ));

        String filename = "testrix-" + engine.getEngineType().name().toLowerCase() + "-starter-kit.zip";
        response.setContentType("application/zip");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
        response.setContentLength(zip.length);
        response.getOutputStream().write(zip);
        response.getOutputStream().flush();
    }

    private TestEngine findOwned(Long id) {
        Long projectId = currentProjectService.requireProjectId();
        return repository.findByIdAndProjectId(id, projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test Engine not found in this workspace"));
    }
}
