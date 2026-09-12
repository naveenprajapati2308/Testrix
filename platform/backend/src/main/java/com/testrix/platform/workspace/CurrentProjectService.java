package com.testrix.platform.workspace;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Super Admin carries no project context by design (excluded from V21's project_users backfill),
 * so a null here means "no workspace" and must be rejected, never read as "no restriction".
 * Cross-project administration lives on /api/admin/** only.
 */
@Service
public class CurrentProjectService {

    private final ProjectRepository projectRepository;

    public CurrentProjectService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    public Long currentProjectIdOrNull() {
        ProjectContext context = ProjectContextHolder.get();
        return context != null ? context.projectId() : null;
    }

    public Long requireProjectId() {
        Long projectId = currentProjectIdOrNull();
        if (projectId == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No active project selected");
        }
        return projectId;
    }

    /** Used only by Super-Admin-only admin-tier creates (Modules/Environments), which have no
     *  project context of their own but must still stamp a project_id on the new row. */
    public Long defaultWorkspaceProjectId() {
        return projectRepository.findByProjectCode("PRJ-000001")
                .map(Project::getId)
                .orElseThrow(() -> new IllegalStateException("Default Workspace project not found"));
    }

    /** True only when the caller has a real project context that matches the entity's — a
     *  project-less caller (Super Admin) never has access via this path (see class javadoc). */
    public boolean canAccess(Long entityProjectId) {
        Long callerProjectId = currentProjectIdOrNull();
        return callerProjectId != null && callerProjectId.equals(entityProjectId);
    }
}
