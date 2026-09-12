package com.automationportal.modules;

import com.automationportal.common.ApiResponse;
import com.automationportal.environments.EnvironmentEntity;
import com.automationportal.environments.EnvironmentRepository;
import com.automationportal.environments.EnvironmentSummaryDto;
import com.automationportal.frameworks.FrameworkRegistry;
import com.automationportal.moduleenvironments.ModuleEnvironmentEntity;
import com.automationportal.moduleenvironments.ModuleEnvironmentRepository;
import com.automationportal.moduleenvironments.ModuleEnvironmentResolver;
import com.automationportal.security.CurrentProjectService;
import com.automationportal.security.ProjectContext;
import com.automationportal.security.ProjectContextHolder;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/modules")
public class ModuleController {
    private final ModuleRepository repository;
    private final ModuleEnvironmentRepository moduleEnvironmentRepository;
    private final EnvironmentRepository environmentRepository;
    private final FrameworkRegistry frameworkRegistry;
    private final CurrentProjectService currentProjectService;
    private final java.net.http.HttpClient httpClient;

    @org.springframework.beans.factory.annotation.Value("${portal.execution-manager.url:http://localhost:8090}")
    private String executionManagerUrl;

    public ModuleController(ModuleRepository repository,
                             ModuleEnvironmentRepository moduleEnvironmentRepository,
                             EnvironmentRepository environmentRepository,
                             FrameworkRegistry frameworkRegistry,
                             CurrentProjectService currentProjectService) {
        this.repository = repository;
        this.moduleEnvironmentRepository = moduleEnvironmentRepository;
        this.environmentRepository = environmentRepository;
        this.frameworkRegistry = frameworkRegistry;
        this.currentProjectService = currentProjectService;
        this.httpClient = java.net.http.HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(5))
                .build();
    }

    // Public listing consumed by the Execution Center / Dashboard pickers — only modules that
    // are both active (not disabled) and visible (not hidden) ever appear here; admin screens
    // use ModuleAdminController's unfiltered listing instead. Scoped to the caller's project; a
    // project-less caller (Super Admin) is rejected (403) rather than shown every project's
    // modules (docs/version2.2.md isolation).
    @GetMapping
    public ApiResponse<List<ModuleEntity>> list(@RequestParam(required = false) String framework) {
        Long projectId = currentProjectService.requireProjectId();
        List<ModuleEntity> modules = (framework != null && !framework.isBlank())
                ? repository.findByProjectIdAndRunnerType(projectId, framework)
                : repository.findByProjectId(projectId);
        return ApiResponse.ok(modules.stream()
                .filter(ModuleEntity::isActive)
                .filter(ModuleEntity::isVisible)
                .toList());
    }

    // Lets a Project Admin create their own project's first Module (Automation Setup Wizard)
    // without going through ModuleAdminController — that controller is Super-Admin-only
    // (SecurityConfig's blanket /api/admin/** rule) and lists every project's modules
    // unfiltered, so it's the wrong endpoint to open up for wizard traffic. projectId is always
    // stamped server-side from the caller's own session, never trusted from the request body —
    // same pattern as EnvironmentController.create().
    @PostMapping
    public ApiResponse<ModuleEntity> create(@RequestBody ModuleEntity body) {
        if (body.getCode() == null || body.getCode().trim().isEmpty()) {
            throw new IllegalArgumentException("Code is required");
        }
        if (body.getName() == null || body.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("Name is required");
        }
        Long callerProjectId = currentProjectService.requireProjectId();
        requireProjectAdmin();
        String runnerType = body.getRunnerType() != null && !body.getRunnerType().isBlank()
                ? body.getRunnerType() : "MAVEN_TESTNG";
        if (repository.findByCodeAndRunnerType(body.getCode(), runnerType).isPresent()) {
            throw new IllegalArgumentException(
                    "A " + runnerType + " module with code '" + body.getCode() + "' already exists.");
        }
        ModuleEntity m = new ModuleEntity(body.getCode(), body.getName());
        m.setProjectId(callerProjectId);
        m.setDescription(body.getDescription());
        m.setXmlFile(body.getXmlFile());
        m.setReportPath(body.getReportPath());
        m.setRunnerType(runnerType);
        m.setTestEngineId(body.getTestEngineId());
        return ApiResponse.ok(repository.save(m));
    }

    private void requireProjectAdmin() {
        ProjectContext context = ProjectContextHolder.get();
        if (context == null || !context.hasRole("PROJECT_ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only a Project Admin can create modules");
        }
    }

    // A Module can't actually be run against an Environment until this mapping exists and is
    // enabled — normally an admin-only step (ModuleEnvironmentAdminController, /api/admin/**),
    // which would otherwise leave the Automation Setup Wizard's own Module (step 3) and
    // Environment (step 4) unable to run anything together. Same ownership pattern as create()
    // above: both the module and the environment must belong to the caller's own project.
    @PostMapping("/{id}/environments/{environmentId}/enable")
    public ApiResponse<Void> enableForEnvironment(@PathVariable Long id, @PathVariable Long environmentId) {
        Long callerProjectId = currentProjectService.requireProjectId();
        requireProjectAdmin();
        ModuleEntity module = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Module not found: " + id));
        if (!callerProjectId.equals(module.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Module not found: " + id);
        }
        EnvironmentEntity environment = environmentRepository.findById(environmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found: " + environmentId));
        if (!callerProjectId.equals(environment.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found: " + environmentId);
        }
        ModuleEnvironmentEntity mapping = moduleEnvironmentRepository.findByModuleIdAndEnvironmentId(id, environmentId)
                .orElseGet(() -> {
                    ModuleEnvironmentEntity m = new ModuleEnvironmentEntity();
                    m.setModuleId(id);
                    m.setEnvironmentId(environmentId);
                    return m;
                });
        mapping.setEnabled(true);
        moduleEnvironmentRepository.save(mapping);
        return ApiResponse.ok(null);
    }

    // "Load Supported Environments" step: only environments explicitly enabled for this module.
    @GetMapping("/{id}/environments")
    public ApiResponse<List<EnvironmentSummaryDto>> supportedEnvironments(@PathVariable Long id) {
        requireModuleAccess(id);
        List<Long> environmentIds = moduleEnvironmentRepository.findByModuleId(id).stream()
                .filter(ModuleEnvironmentEntity::isEnabled)
                .map(ModuleEnvironmentEntity::getEnvironmentId)
                .toList();
        List<EnvironmentSummaryDto> environments = environmentRepository.findAllById(environmentIds).stream()
                .filter(EnvironmentEntity::isActive)
                .map(EnvironmentSummaryDto::from)
                .toList();
        return ApiResponse.ok(environments);
    }

    // "Load Configuration" / "Load Browser Options" steps: resolved, NON-SECRET run options for
    // this module+environment combination. Deliberately excludes configJson/credentials — those
    // stay admin-only via ModuleEnvironmentAdminController.
    @GetMapping("/{id}/environments/{environmentId}/options")
    public ApiResponse<Map<String, Object>> environmentOptions(@PathVariable Long id, @PathVariable Long environmentId) {
        ModuleEntity module = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Module not found: " + id));
        requireModuleAccess(module);
        EnvironmentEntity environment = environmentRepository.findById(environmentId)
                .orElseThrow(() -> new IllegalArgumentException("Environment not found: " + environmentId));
        ModuleEnvironmentEntity mapping = moduleEnvironmentRepository
                .findByModuleIdAndEnvironmentIdAndEnabledTrue(id, environmentId)
                .orElseThrow(() -> new IllegalArgumentException("Module " + module.getCode() + " is not enabled for environment " + environment.getCode()));

        List<String> frameworkBrowsers = frameworkRegistry.find(module.getRunnerType())
                .map(fw -> fw.browsers())
                .orElse(List.of());

        Map<String, Object> options = new java.util.LinkedHashMap<>();
        options.put("baseUrl", ModuleEnvironmentResolver.resolveBaseUrl(mapping, environment.getBaseUrl()));
        options.put("browsers", ModuleEnvironmentResolver.resolveBrowsers(mapping, frameworkBrowsers));
        options.put("timeoutMinutes", ModuleEnvironmentResolver.resolveTimeoutMinutes(mapping, 120));
        return ApiResponse.ok(options);
    }

    // Run-scope tags (e.g. "@smoke", "@regression") discovered live from this module's own
    // spec/test titles — nothing is registered by hand anywhere, so a module with no tagged
    // tests yet just returns an empty list rather than blocking or erroring. Optional, additive
    // filter only: the Execution Center always has an unfiltered "All tests" option regardless
    // of what (if anything) comes back here.
    @GetMapping("/{id}/tags")
    public ApiResponse<List<String>> tags(@PathVariable Long id) {
        try {
            ModuleEntity module = repository.findById(id).orElse(null);
            if (module == null || !currentProjectService.canAccess(module.getProjectId())
                    || module.getXmlFile() == null || module.getXmlFile().isBlank()) {
                return ApiResponse.ok(List.of());
            }
            String url = executionManagerUrl + "/em/tags?path="
                    + java.net.URLEncoder.encode(module.getXmlFile(), java.nio.charset.StandardCharsets.UTF_8);
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url))
                    .GET()
                    .timeout(java.time.Duration.ofSeconds(5))
                    .build();
            java.net.http.HttpResponse<String> response = httpClient.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                return ApiResponse.ok(List.of());
            }
            List<String> tags = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(response.body(), new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
            return ApiResponse.ok(tags);
        } catch (Exception e) {
            // Tag discovery is a convenience filter, never a hard requirement — any failure
            // (runner unreachable, malformed response) degrades to "no tags available" instead
            // of surfacing an error to a run screen the user needs to keep working.
            return ApiResponse.ok(List.of());
        }
    }

    private void requireModuleAccess(Long moduleId) {
        ModuleEntity module = repository.findById(moduleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Module not found: " + moduleId));
        requireModuleAccess(module);
    }

    private void requireModuleAccess(ModuleEntity module) {
        if (!currentProjectService.canAccess(module.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Module not found: " + module.getId());
        }
    }
}
