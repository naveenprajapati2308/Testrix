package com.testrix.platform.workspace;

import com.testrix.platform.auth.AuthenticatedUserService;
import com.testrix.platform.common.ApiResponse;
import com.testrix.platform.users.UserRole;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.List;


@RestController
@RequestMapping("/api/projects/{projectId}/settings")
public class ProjectSettingsController {
    private final ProjectRepository projectRepository;
    private final ProjectModuleRepository projectModuleRepository;
    private final AuthenticatedUserService authenticatedUserService;

    public ProjectSettingsController(ProjectRepository projectRepository,
                                     ProjectModuleRepository projectModuleRepository,
                                     AuthenticatedUserService authenticatedUserService) {
        this.projectRepository = projectRepository;
        this.projectModuleRepository = projectModuleRepository;
        this.authenticatedUserService = authenticatedUserService;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ApiResponse<ProjectDtos.WorkspaceSettingsDto> get(@PathVariable Long projectId) {
        requireProjectAccess(projectId);
        return ApiResponse.ok(toDto(findProject(projectId)));
    }

    @PutMapping("/profile")
    @Transactional
    public ApiResponse<ProjectDtos.WorkspaceSettingsDto> updateProfile(@PathVariable Long projectId,
            @RequestBody ProjectDtos.UpdateProfileRequest request) {
        requireProjectAccess(projectId);
        Project project = findProject(projectId);
        if (request.description() != null) project.setDescription(request.description().trim());
        if (request.backendTech() != null) project.setBackendTech(request.backendTech().trim());
        if (request.frontendTech() != null) project.setFrontendTech(request.frontendTech().trim());
        if (request.databaseTech() != null) project.setDatabaseTech(request.databaseTech().trim());
        if (request.cicdTool() != null) project.setCicdTool(request.cicdTool().trim());
        projectRepository.save(project);
        return ApiResponse.ok(toDto(project));
    }

    @PutMapping("/modules/{moduleType}")
    @Transactional
    public ApiResponse<ProjectDtos.WorkspaceSettingsDto> toggleModule(@PathVariable Long projectId,
            @PathVariable String moduleType, @RequestBody ProjectDtos.ToggleModuleRequest request) {
        requireProjectAccess(projectId);
        Project project = findProject(projectId);
        ProjectModuleType type;
        try {
            type = ProjectModuleType.valueOf(moduleType.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unknown module '" + moduleType + "'");
        }
        List<ProjectModule> allModules = projectModuleRepository.findByProjectId(projectId);
        List<ProjectModule> existing = allModules.stream()
                .filter(pm -> pm.getModuleType() == type)
                .toList();

        // Disabling every product leaves the project's own sidebar with nothing to show and no
        // way back in short of a Super Admin override — always keep at least one enabled.
        if (!request.enabled()) {
            boolean anyOtherEnabled = allModules.stream()
                    .anyMatch(pm -> pm.getModuleType() != type && pm.isEnabled());
            if (!anyOtherEnabled) {
                throw new IllegalArgumentException("At least one product must stay enabled for this workspace");
            }
        }

        if (existing.isEmpty()) {
            projectModuleRepository.save(new ProjectModule(project, type, request.enabled()));
        } else {
            for (ProjectModule pm : existing) {
                pm.setEnabled(request.enabled());
            }
            projectModuleRepository.saveAll(existing);
        }
        return ApiResponse.ok(toDto(project));
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private void requireProjectAccess(Long projectId) {
        var current = authenticatedUserService.currentUser();
        if (current.getRole() == UserRole.SUPER_ADMIN) return;
        ProjectContext context = ProjectContextHolder.get();
        if (context == null || !context.projectId().equals(projectId) || !context.hasRole("PROJECT_ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only this project's Project Admin can manage its settings");
        }
    }

    private Project findProject(Long projectId) {
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
    }

    private ProjectDtos.WorkspaceSettingsDto toDto(Project project) {
        List<ProjectModule> rows = projectModuleRepository.findByProjectId(project.getId());
        List<ProjectDtos.ModuleToggleDto> modules = Arrays.stream(ProjectModuleType.values())
                .map(type -> {
                    boolean enabled = rows.stream().anyMatch(pm -> pm.getModuleType() == type && pm.isEnabled());
                    return new ProjectDtos.ModuleToggleDto(type.name(), enabled);
                })
                .toList();
        return new ProjectDtos.WorkspaceSettingsDto(
                project.getId(), project.getProjectCode(), project.getWorkspaceCode(), project.getName(),
                project.getDescription(), project.getBackendTech(), project.getFrontendTech(),
                project.getDatabaseTech(), project.getCicdTool(), modules
        );
    }
}
