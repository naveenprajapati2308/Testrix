package com.automationportal.environments;

import com.automationportal.common.ApiResponse;
import com.automationportal.common.EntityIdGeneratorService;
import com.automationportal.modules.ModuleEntity;
import com.automationportal.modules.ModuleRepository;
import com.automationportal.moduleenvironments.ModuleEnvironmentEntity;
import com.automationportal.moduleenvironments.ModuleEnvironmentRepository;
import com.automationportal.security.CurrentProjectService;
import com.automationportal.security.ProjectContext;
import com.automationportal.security.ProjectContextHolder;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/environments")
public class EnvironmentController {
    private final EnvironmentRepository repository;
    private final EnvironmentHealthService healthService;
    private final ModuleEnvironmentRepository moduleEnvironmentRepository;
    private final ModuleRepository moduleRepository;
    private final EntityIdGeneratorService entityIdGeneratorService;
    private final CurrentProjectService currentProjectService;

    public EnvironmentController(EnvironmentRepository repository,
                                  EnvironmentHealthService healthService,
                                  ModuleEnvironmentRepository moduleEnvironmentRepository,
                                  ModuleRepository moduleRepository,
                                  EntityIdGeneratorService entityIdGeneratorService,
                                  CurrentProjectService currentProjectService) {
        this.repository = repository;
        this.healthService = healthService;
        this.moduleEnvironmentRepository = moduleEnvironmentRepository;
        this.moduleRepository = moduleRepository;
        this.entityIdGeneratorService = entityIdGeneratorService;
        this.currentProjectService = currentProjectService;
    }

    // Project-scoped only — a project-less caller (Super Admin) is rejected (403) rather than
    // shown every project's environments. Environments are each project's own responsibility,
    // managed by its Project Admin via Workspace Settings (docs/version2.2.md isolation).
    @GetMapping
    public ApiResponse<List<EnvironmentSummaryDto>> list() {
        Long projectId = currentProjectService.requireProjectId();
        List<EnvironmentEntity> environments = repository.findByProjectId(projectId);
        return ApiResponse.ok(environments.stream().map(EnvironmentSummaryDto::from).toList());
    }

    // Reverse lookup used by Dashboard's "Run Now" quick-launch and the admin cross-link
    // ("Used by N modules") — which active, visible modules are enabled for this environment.
    @GetMapping("/{id}/modules")
    public ApiResponse<List<ModuleEntity>> supportedModules(@PathVariable Long id,
                                                              @RequestParam(required = false) String framework) {
        EnvironmentEntity environment = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found: " + id));
        if (!currentProjectService.canAccess(environment.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found: " + id);
        }
        List<Long> moduleIds = moduleEnvironmentRepository.findByEnvironmentId(id).stream()
                .filter(ModuleEnvironmentEntity::isEnabled)
                .map(ModuleEnvironmentEntity::getModuleId)
                .toList();
        List<ModuleEntity> modules = moduleRepository.findAllById(moduleIds).stream()
                .filter(ModuleEntity::isActive)
                .filter(ModuleEntity::isVisible)
                .filter(m -> framework == null || framework.isBlank() || framework.equals(m.getRunnerType()))
                .toList();
        return ApiResponse.ok(modules);
    }

    // Was SUPER_ADMIN-only at the security layer (see SecurityConfig) because the service behind
    // this used to return every project's environments/executions unfiltered — genuinely unsafe
    // to open to project users as-is. Now scoped to the caller's own project (same pattern as
    // list() above), which is what makes it safe for a Project Admin to actually reach their own
    // Environments page instead of 403ing on it.
    @GetMapping("/health")
    public ApiResponse<List<Map<String, Object>>> health() {
        Long projectId = currentProjectService.requireProjectId();
        return ApiResponse.ok(healthService.health(projectId));
    }

    // Write access (create/update/delete) is the caller's own project's Project Admin acting
    // only on their own project's environments — enforced in code via ProjectContextHolder
    // rather than a blanket Spring Security rule, same pattern as ProjectUserController. Super
    // Admin has no project context and is rejected here; there's no cross-project equivalent.
    @PostMapping
    public ApiResponse<EnvironmentEntity> create(@RequestBody EnvironmentEntity entity) {
        if (entity.getCode() == null || entity.getCode().trim().isEmpty()) {
            throw new IllegalArgumentException("Code is required");
        }
        if (entity.getName() == null || entity.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("Name is required");
        }
        entity.setBusinessId(entityIdGeneratorService.next("ENV"));
        Long callerProjectId = currentProjectService.requireProjectId();
        requireProjectAdmin();
        entity.setProjectId(callerProjectId);
        return ApiResponse.ok(repository.save(entity));
    }

    @PutMapping("/{id}")
    public ApiResponse<EnvironmentEntity> update(@PathVariable Long id, @RequestBody EnvironmentEntity entity) {
        EnvironmentEntity existing = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Environment not found: " + id));
        requireWriteAccess(existing.getProjectId());
        if (entity.getCode() != null && !entity.getCode().trim().isEmpty()) {
            existing.setCode(entity.getCode());
        }
        if (entity.getName() != null && !entity.getName().trim().isEmpty()) {
            existing.setName(entity.getName());
        }
        if (entity.getBaseUrl() != null) {
            existing.setBaseUrl(entity.getBaseUrl());
        }
        if (entity.getConfigJson() != null) {
            existing.setConfigJson(entity.getConfigJson());
        }
        existing.setActive(entity.isActive());
        return ApiResponse.ok(repository.save(existing));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<String> delete(@PathVariable Long id) {
        EnvironmentEntity existing = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Please Try again Environment not found: " + id));
        requireWriteAccess(existing.getProjectId());
        repository.deleteById(id);
        return ApiResponse.ok("Environment deleted successfully");
    }

    private void requireProjectAdmin() {
        ProjectContext context = ProjectContextHolder.get();
        if (context == null || !context.hasRole("PROJECT_ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only a Project Admin can manage environments");
        }
    }

    private void requireWriteAccess(Long entityProjectId) {
        Long callerProjectId = currentProjectService.requireProjectId();
        requireProjectAdmin();
        if (!callerProjectId.equals(entityProjectId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found");
        }
    }
}
