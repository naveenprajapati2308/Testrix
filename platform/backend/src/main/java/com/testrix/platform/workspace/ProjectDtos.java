package com.testrix.platform.workspace;

import java.time.Instant;
import java.util.List;

public final class ProjectDtos {
    private ProjectDtos() {}

    public record ProjectSummary(
        Long id,
        String projectCode,
        String workspaceCode,
        String name,
        String tenantName,
        ProjectStatus status,
        List<String> enabledModules,
        long memberCount,
        Instant createdAt
    ) {}

    /** The project context + this user's roles in it — what the shell needs right after login. */
    public record MyProjectSummary(
        Long id,
        String projectCode,
        String workspaceCode,
        String name,
        List<String> enabledModules,
        List<String> roles
    ) {}

    /** Project Admin's self-service Workspace Settings view. */
    public record WorkspaceSettingsDto(
        Long id,
        String projectCode,
        String workspaceCode,
        String name,
        String description,
        String backendTech,
        String frontendTech,
        String databaseTech,
        String cicdTool,
        List<ModuleToggleDto> modules
    ) {}

    public record ModuleToggleDto(String moduleType, boolean enabled) {}

    public record UpdateProfileRequest(
        String description,
        String backendTech,
        String frontendTech,
        String databaseTech,
        String cicdTool
    ) {}

    public record ToggleModuleRequest(boolean enabled) {}
}
