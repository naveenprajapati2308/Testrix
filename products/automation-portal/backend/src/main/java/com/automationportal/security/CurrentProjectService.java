package com.automationportal.security;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Super Admin carries no project context by design, so a null here means "no workspace" and must
 * be rejected, never read as "no restriction". Cross-project admin lives on /api/admin/** only.
 */
@Service
public class CurrentProjectService {

    private final JdbcTemplate jdbcTemplate;

    public CurrentProjectService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
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

    /** Admin-tier creates have no project context but must still stamp a project_id. Read straight
     *  from the shared schema — projects is the platform service's table, not this product's. */
    public Long defaultWorkspaceProjectId() {
        Long id = jdbcTemplate.query("SELECT id FROM projects WHERE project_code = ?",
                rs -> rs.next() ? rs.getLong(1) : null, "PRJ-000001");
        if (id == null) {
            throw new IllegalStateException("Default Workspace project not found");
        }
        return id;
    }

    /** True only when the caller has a real project context that matches the entity's — a
     *  project-less caller (Super Admin) never has access via this path. */
    public boolean canAccess(Long entityProjectId) {
        Long callerProjectId = currentProjectIdOrNull();
        return callerProjectId != null && callerProjectId.equals(entityProjectId);
    }
}
