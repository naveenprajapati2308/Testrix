package com.testrix.platform.workspace;

import com.testrix.platform.audit.AuditAction;
import com.testrix.platform.audit.AuditService;
import com.testrix.platform.auth.AuthenticatedUserService;
import com.testrix.platform.common.ApiResponse;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.ArrayList;
import java.util.List;

/**
 * Super Admin's platform-wide project/workspace view. Already covered by SecurityConfig's
 * blanket /api/admin/** -> hasRole("SUPER_ADMIN") rule.
 */
@RestController
@RequestMapping("/api/admin/projects")
public class AdminProjectController {
    private final ProjectRepository projectRepository;
    private final ProjectModuleRepository projectModuleRepository;
    private final ProjectUserRepository projectUserRepository;
    private final AuditService auditService;
    private final AuthenticatedUserService authenticatedUserService;

    @PersistenceContext
    private EntityManager entityManager;

    public AdminProjectController(ProjectRepository projectRepository,
                                  ProjectModuleRepository projectModuleRepository,
                                  ProjectUserRepository projectUserRepository,
                                  AuditService auditService,
                                  AuthenticatedUserService authenticatedUserService) {
        this.projectRepository = projectRepository;
        this.projectModuleRepository = projectModuleRepository;
        this.projectUserRepository = projectUserRepository;
        this.auditService = auditService;
        this.authenticatedUserService = authenticatedUserService;
    }

    // Suspending blocks login/access for every one of this workspace's users (see
    // ProjectResolutionService.activeProjects) — reversible via /activate at any time, so unlike
    // /delete there's no "last remaining workspace" guard here.
    @PutMapping("/{id}/suspend")
    public ApiResponse<ProjectDtos.ProjectSummary> suspend(@PathVariable Long id, HttpServletRequest servletRequest) {
        Project project = findProject(id);
        project.setStatus(ProjectStatus.SUSPENDED);
        projectRepository.save(project);
        auditService.record(authenticatedUserService.currentUser(), AuditAction.WORKSPACE_SUSPENDED,
            "Workspace \"" + project.getName() + "\" suspended", servletRequest);
        return ApiResponse.ok(summarize(project));
    }

    @PutMapping("/{id}/activate")
    public ApiResponse<ProjectDtos.ProjectSummary> activate(@PathVariable Long id, HttpServletRequest servletRequest) {
        Project project = findProject(id);
        project.setStatus(ProjectStatus.ACTIVE);
        projectRepository.save(project);
        auditService.record(authenticatedUserService.currentUser(), AuditAction.WORKSPACE_REACTIVATED,
            "Workspace \"" + project.getName() + "\" reactivated", servletRequest);
        return ApiResponse.ok(summarize(project));
    }

    // Every table across all three products (automation-portal, api-testing, performance-testing)
    // that carries a project_id column and holds real operational data — deliberately excludes
    // project_modules/project_users, which this endpoint clears itself as part of the delete.
    // Workspace deletion isn't built as a general feature yet (docs/version2.1.md lists
    // "Workspace archive and restore" as future scope) — this is deliberately conservative:
    // delete only ever succeeds for a workspace with zero real data in any of these, across any
    // product, so it can never silently destroy executions/reports/collections/etc.
    private static final List<String> PROJECT_DATA_TABLES = List.of(
        "modules", "environments", "executions",
        "API_MASTER", "BASE_API_MASTER", "API_GROUP", "API_GROUP_EXECUTION", "API_SCHEDULE",
        "API_EXECUTION_HISTORY", "MODULE_MASTER", "api_collection",
        "perf_virtual_user", "perf_performance_test", "perf_load_test", "perf_test_group",
        "perf_test_run", "perf_test_schedule", "perf_drift_alert"
    );

    @DeleteMapping("/{id}")
    @Transactional
    public ApiResponse<String> delete(@PathVariable Long id) {
        Project project = findProject(id);
        if (projectRepository.count() <= 1) {
            throw new IllegalArgumentException("Cannot delete the platform's last remaining workspace");
        }

        List<String> nonEmpty = new ArrayList<>();
        for (String table : PROJECT_DATA_TABLES) {
            Number count = (Number) entityManager
                .createNativeQuery("SELECT COUNT(*) FROM " + table + " WHERE project_id = :pid")
                .setParameter("pid", id)
                .getSingleResult();
            if (count.longValue() > 0) {
                nonEmpty.add(table);
            }
        }
        if (!nonEmpty.isEmpty()) {
            throw new IllegalArgumentException(
                "Workspace \"" + project.getName() + "\" still has data in: " + String.join(", ", nonEmpty)
                    + ". Remove it before deleting the workspace.");
        }

        entityManager.createNativeQuery("UPDATE users SET current_project_id = NULL WHERE current_project_id = :pid")
            .setParameter("pid", id).executeUpdate();
        entityManager.createNativeQuery("UPDATE workspace_requests SET resulting_project_id = NULL WHERE resulting_project_id = :pid")
            .setParameter("pid", id).executeUpdate();
        projectUserRepository.deleteAll(projectUserRepository.findByProjectId(id));
        projectModuleRepository.deleteAll(projectModuleRepository.findByProjectId(id));
        projectRepository.delete(project);

        return ApiResponse.ok("Workspace \"" + project.getName() + "\" deleted");
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ApiResponse<List<ProjectDtos.ProjectSummary>> list() {
        return ApiResponse.ok(projectRepository.findAll().stream().map(this::summarize).toList());
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public ApiResponse<ProjectDtos.ProjectSummary> get(@PathVariable Long id) {
        return ApiResponse.ok(summarize(findProject(id)));
    }

    private Project findProject(Long id) {
        return projectRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
    }

    private ProjectDtos.ProjectSummary summarize(Project project) {
        List<String> enabledModules = projectModuleRepository.findByProjectIdAndEnabledTrue(project.getId())
            .stream().map(m -> m.getModuleType().name()).toList();
        long memberCount = projectUserRepository.findByProjectIdAndStatus(project.getId(), ProjectUserStatus.ACTIVE)
            .stream().map(pu -> pu.getUser().getId()).distinct().count();
        return new ProjectDtos.ProjectSummary(
            project.getId(), project.getProjectCode(), project.getWorkspaceCode(), project.getName(),
            project.getTenant().getName(), project.getStatus(), enabledModules, memberCount, project.getCreatedAt()
        );
    }
}
