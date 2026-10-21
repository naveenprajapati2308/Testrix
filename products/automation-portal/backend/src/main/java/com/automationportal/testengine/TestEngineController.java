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
    private final com.automationportal.security.EncryptionService encryptionService;

    public TestEngineController(TestEngineRepository repository,
                                TestEngineCredentialService credentialService,
                                CurrentProjectService currentProjectService,
                                CurrentUserService currentUserService,
                                EntityIdGeneratorService entityIdGeneratorService,
                                StarterKitService starterKitService,
                                PortalAutomationProperties automationProperties,
                                com.automationportal.security.EncryptionService encryptionService) {
        this.repository = repository;
        this.credentialService = credentialService;
        this.currentProjectService = currentProjectService;
        this.currentUserService = currentUserService;
        this.entityIdGeneratorService = entityIdGeneratorService;
        this.starterKitService = starterKitService;
        this.automationProperties = automationProperties;
        this.encryptionService = encryptionService;
    }

    private TestEngineDtos.Summary toSummary(TestEngine e, String keyPrefix) {
        String maskedToken = null;
        if (e.getGitTokenEncrypted() != null && !e.getGitTokenEncrypted().isBlank()) {
            try {
                String decrypted = encryptionService.decrypt(e.getGitTokenEncrypted());
                maskedToken = com.automationportal.security.EncryptionService.maskToken(decrypted);
            } catch (Exception ex) {
                maskedToken = "******";
            }
        }
        return TestEngineDtos.Summary.from(e, keyPrefix, maskedToken);
    }

    @GetMapping
    public ApiResponse<List<TestEngineDtos.Summary>> list() {
        Long projectId = currentProjectService.requireProjectId();
        return ApiResponse.ok(repository.findByProjectId(projectId).stream()
                .map(e -> toSummary(e, credentialService.activeKeyPrefix(e.getId()).orElse(null)))
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
        return ApiResponse.ok(toSummary(engine, credentialService.activeKeyPrefix(engine.getId()).orElse(null)));
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

        // Multi-source mode fields
        engine.setSourceType(body.sourceType() != null ? body.sourceType() : SourceType.LOCAL_DEV);
        engine.setGitRepoUrl(body.gitRepoUrl() != null ? body.gitRepoUrl().trim() : null);
        engine.setGitBranch(body.gitBranch() != null && !body.gitBranch().isBlank() ? body.gitBranch().trim() : "main");
        engine.setGitAuthType(body.gitAuthType() != null ? body.gitAuthType() : GitAuthType.NONE);
        if (body.gitToken() != null && !body.gitToken().isBlank()) {
            engine.setGitTokenEncrypted(encryptionService.encrypt(body.gitToken().trim()));
        }
        engine.setGitUsername(body.gitUsername() != null ? body.gitUsername().trim() : null);
        engine.setLocalAgentId(body.localAgentId() != null ? body.localAgentId().trim() : null);

        engine.setCreatedByUserId(currentUserService.currentUser().id());
        repository.save(engine);

        TestEngineCredentialService.IssuedCredential issued = credentialService.issue(engine.getId());

        return ApiResponse.created("Test Engine registered — copy the key now, it will not be shown again", Map.of(
                "engine", toSummary(engine, issued.keyPrefix()),
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

        // Multi-source mode updates
        if (body.sourceType() != null) engine.setSourceType(body.sourceType());
        if (body.gitRepoUrl() != null) engine.setGitRepoUrl(body.gitRepoUrl().trim());
        if (body.gitBranch() != null && !body.gitBranch().isBlank()) engine.setGitBranch(body.gitBranch().trim());
        if (body.gitAuthType() != null) engine.setGitAuthType(body.gitAuthType());
        if (body.gitToken() != null && !body.gitToken().isBlank()) {
            engine.setGitTokenEncrypted(encryptionService.encrypt(body.gitToken().trim()));
        }
        if (body.gitUsername() != null) engine.setGitUsername(body.gitUsername().trim());
        if (body.localAgentId() != null) engine.setLocalAgentId(body.localAgentId().trim());

        repository.save(engine);
        return ApiResponse.ok(toSummary(engine, credentialService.activeKeyPrefix(engine.getId()).orElse(null)));
    }

    /**
     * Validates the framework path. Supports both absolute paths (e.g. D:\playwright-js or /opt/tests)
     * for custom/migrated frameworks anywhere on the host, as well as relative subfolder names.
     * Prevents malicious directory traversal via "..".
     */
    private String validateFrameworkPath(String frameworkPath) {
        if (frameworkPath == null || frameworkPath.isBlank()) return frameworkPath;
        String trimmed = frameworkPath.trim();
        if (trimmed.contains("..")) {
            throw new IllegalArgumentException(
                    "Framework path cannot contain '..' directory traversal");
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

    @PostMapping("/test-git-connection")
    public ApiResponse<TestEngineDtos.TestGitConnectionResult> testGitConnection(@RequestBody TestEngineDtos.TestGitConnectionRequest body) {
        if (body.gitRepoUrl() == null || body.gitRepoUrl().isBlank()) {
            throw new IllegalArgumentException("Git repository URL is required");
        }
        String url = body.gitRepoUrl().trim();
        String branch = body.gitBranch() != null && !body.gitBranch().isBlank() ? body.gitBranch().trim() : "main";
        String token = body.gitToken() != null ? body.gitToken().trim() : null;
        String username = body.gitUsername() != null ? body.gitUsername().trim() : null;

        try {
            List<String> cmd = new java.util.ArrayList<>();
            cmd.add("git");
            if (token != null && !token.isBlank() && !url.startsWith("file:")) {
                if (username != null && !username.isBlank()) {
                    String raw = username + ":" + token;
                    String encoded = java.util.Base64.getEncoder().encodeToString(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    cmd.add("-c");
                    cmd.add("http.extraHeader=Authorization: Basic " + encoded);
                } else {
                    cmd.add("-c");
                    cmd.add("http.extraHeader=Authorization: Bearer " + token);
                }
            }
            cmd.add("ls-remote");
            cmd.add("--heads");
            cmd.add(url);
            cmd.add(branch);

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            StringBuilder out = new StringBuilder();
            try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream(), java.nio.charset.StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    if (out.length() < 1000) {
                        out.append(line).append("\n");
                    }
                }
            }
            boolean finished = p.waitFor(12, java.util.concurrent.TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(false, "Connection timed out after 12 seconds. Please check the repository URL and network accessibility.", branch, -1));
            }
            int exitCode = p.exitValue();
            if (exitCode == 0) {
                String outputStr = out.toString();
                if (!outputStr.isBlank() && outputStr.contains(branch)) {
                    return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(true, "Successfully connected to repository and verified branch '" + branch + "'!", branch, 0));
                } else {
                    return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(true, "Successfully connected to repository (verified connection to remote).", branch, 0));
                }
            } else {
                String msg = out.toString().replaceAll("(?i)(bearer|basic|token|ghp_)[^\\s]+", "******");
                if (msg.contains("Authentication failed") || msg.contains("401") || msg.contains("403")) {
                    return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(false, "Authentication failed. Please verify your Personal Access Token or credentials.", branch, exitCode));
                }
                return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(false, "Git remote check failed: " + msg.trim(), branch, exitCode));
            }
        } catch (java.io.IOException e) {
            return testGitConnectionViaHttp(url, token, username, branch);
        } catch (Exception e) {
            return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(false, "Error verifying repository: " + e.getMessage(), branch, -1));
        }
    }

    private ApiResponse<TestEngineDtos.TestGitConnectionResult> testGitConnectionViaHttp(String url, String token, String username, String branch) {
        try {
            java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                    .connectTimeout(java.time.Duration.ofSeconds(8))
                    .followRedirects(java.net.http.HttpClient.Redirect.NORMAL)
                    .build();

            String infoRefsUrl = url.endsWith(".git") ? url + "/info/refs?service=git-upload-pack" : url + ".git/info/refs?service=git-upload-pack";
            java.net.http.HttpRequest.Builder reqBuilder = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(infoRefsUrl))
                    .timeout(java.time.Duration.ofSeconds(10))
                    .GET();

            if (token != null && !token.isBlank()) {
                if (username != null && !username.isBlank()) {
                    String raw = username + ":" + token;
                    String encoded = java.util.Base64.getEncoder().encodeToString(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    reqBuilder.header("Authorization", "Basic " + encoded);
                } else {
                    reqBuilder.header("Authorization", "Bearer " + token);
                }
            }

            java.net.http.HttpResponse<String> resp = client.send(reqBuilder.build(), java.net.http.HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(true, "Successfully connected to repository via Git HTTP protocol!", branch, 0));
            } else if (resp.statusCode() == 401 || resp.statusCode() == 403) {
                return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(false, "Authentication required or invalid token (HTTP " + resp.statusCode() + ").", branch, resp.statusCode()));
            } else if (resp.statusCode() == 404) {
                return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(false, "Repository not found at URL (HTTP 404).", branch, 404));
            } else {
                return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(false, "Git HTTP check returned status: " + resp.statusCode(), branch, resp.statusCode()));
            }
        } catch (Exception ex) {
            return ApiResponse.ok(new TestEngineDtos.TestGitConnectionResult(false, "Connection check failed: " + ex.getMessage(), branch, -1));
        }
    }

    @PostMapping("/verify-folder")
    public ApiResponse<Map<String, Object>> verifyFolder(@RequestBody TestEngineDtos.VerifyFolderRequest body) {
        if (body.frameworkPath() == null || body.frameworkPath().isBlank()) {
            throw new IllegalArgumentException("Framework folder path is required");
        }
        String validated = validateFrameworkPath(body.frameworkPath());
        String root = automationProperties.getProjectFrameworksRoot();
        if (root == null || root.isBlank()) {
            root = "project-frameworks";
        }
        java.nio.file.Path targetDir;
        java.nio.file.Path p = java.nio.file.Path.of(validated);
        if (p.isAbsolute()) {
            targetDir = p;
        } else {
            targetDir = java.nio.file.Path.of(root, validated);
        }
        boolean exists = java.nio.file.Files.isDirectory(targetDir);
        return ApiResponse.ok(Map.of(
            "exists", exists,
            "frameworkPath", validated,
            "root", root,
            "resolvedPath", targetDir.toAbsolutePath().toString(),
            "message", exists ? "Framework directory verified successfully: " + targetDir.toAbsolutePath() : "Directory '" + validated + "' does not exist."
        ));
    }

    @PostMapping("/{id}/agent-token")
    public ApiResponse<Map<String, String>> generateAgentToken(@PathVariable Long id) {
        TestEngine engine = findOwned(id);
        String token = "tx_agent_" + java.util.UUID.randomUUID().toString().replace("-", "");
        engine.setLocalAgentId(token);
        engine.setLocalAgentStatus("CONFIGURED");
        repository.save(engine);
        return ApiResponse.ok(Map.of(
            "token", token,
            "status", "CONFIGURED",
            "command", "npx @testrix/agent start --token=" + token
        ));
    }

    private TestEngine findOwned(Long id) {
        Long projectId = currentProjectService.requireProjectId();
        return repository.findByIdAndProjectId(id, projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test Engine not found in this workspace"));
    }
}
