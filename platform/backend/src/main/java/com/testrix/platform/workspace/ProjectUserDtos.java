package com.testrix.platform.workspace;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;

public final class ProjectUserDtos {
    private ProjectUserDtos() {}

    /**
     * Onboards a user into the project. If {@code email} already belongs to an existing platform
     * User, that identity is attached to this project with the given roles (the "same user,
     * multiple projects" case) and username/fullName are ignored. Otherwise a brand-new User is
     * created (those fields become required) with a server-generated temporary password —
     * Project Admin's "create a new user for their Project" capability. Either way, the user is
     * emailed so they learn about the new access.
     */
    public record CreateProjectUserRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid address") String email,
        String username,
        String fullName,
        String mobileNumber,
        @NotEmpty(message = "Select at least one role") List<String> roleCodes
    ) {}

    public record UpdateProjectUserRequest(
        @NotBlank(message = "Full name is required") String fullName,
        String mobileNumber,
        String designation,
        String organization
    ) {}

    public record SetStatusRequest(@NotNull ProjectUserStatus status) {}

    public record AssignRolesRequest(@NotEmpty(message = "Select at least one role") List<String> roleCodes) {}

    public record ProjectUserSummary(
        Long userId,
        String username,
        String email,
        String displayName,
        String mobileNumber,
        List<String> roles,
        ProjectUserStatus status,
        Instant joinedAt
    ) {}

    /** One row of "which OTHER workspaces do the caller and this member share" (see {@code /shared-workspaces}). */
    public record SharedWorkspaceMembership(
        Long projectId,
        String projectName,
        List<String> roles,
        String membershipStatus
    ) {}
}
