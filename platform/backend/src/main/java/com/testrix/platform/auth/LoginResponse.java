package com.testrix.platform.auth;

import com.testrix.platform.users.UserProfileDto;
import com.testrix.platform.workspace.ProjectDtos;

import java.util.List;

/**
 * {@code project} is null for Super Admin (never inside a project) or while
 * {@code needsProjectSelection} is true. When a user belongs to more than one active Project,
 * login returns {@code needsProjectSelection=true} with {@code availableProjects} populated
 * instead of a project-scoped session — the shell shows a picker, then calls
 * {@code POST /api/auth/select-project} to obtain a real project-scoped token pair.
 */
public record LoginResponse(
    String accessToken,
    String refreshToken,
    UserProfileDto user,
    ProjectDtos.MyProjectSummary project,
    boolean needsProjectSelection,
    List<ProjectDtos.MyProjectSummary> availableProjects
) {
    public static LoginResponse simple(String accessToken, String refreshToken, UserProfileDto user) {
        return new LoginResponse(accessToken, refreshToken, user, null, false, List.of());
    }

    public static LoginResponse withProject(String accessToken, String refreshToken, UserProfileDto user,
                                            ProjectDtos.MyProjectSummary project) {
        return new LoginResponse(accessToken, refreshToken, user, project, false, List.of());
    }

    public static LoginResponse pendingSelection(String accessToken, String refreshToken, UserProfileDto user,
                                                 List<ProjectDtos.MyProjectSummary> availableProjects) {
        return new LoginResponse(accessToken, refreshToken, user, null, true, availableProjects);
    }
}
