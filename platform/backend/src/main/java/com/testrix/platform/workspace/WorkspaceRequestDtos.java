package com.testrix.platform.workspace;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;

import java.time.Instant;
import java.util.List;

public final class WorkspaceRequestDtos {
    private WorkspaceRequestDtos() {}

    public record SubmitRequest(
        @NotBlank(message = "Project name is required")        String projectName,
        @NotBlank(message = "Organization name is required")   String organizationName,
        String projectDescription,
        String backendTech,
        String frontendTech,
        String databaseTech,
        String cicdTool,
        @NotEmpty(message = "Select at least one testing module") List<ProjectModuleType> requestedModules,
        @NotBlank(message = "Workspace name is required")      String workspaceName,
        @NotBlank(message = "Preferred workspace code is required") String preferredWorkspaceSlug,
        @NotBlank(message = "Project manager name is required") String projectManagerName,
        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid address")      String email,
        @NotBlank(message = "Phone number is required")
        // 7-15 digits (E.164 max length), optional leading '+'. The old range (max 11 digits)
        // rejected any number entered with a country code, e.g. +91 9876543210 (12 digits) —
        // the frontend strips the '+' before sending, so this must match on digit count alone.
        @Pattern(regexp = "^\\+?[1-9]\\d{6,14}$", message = "Phone number is not valid") String phone,
        Integer expectedTeamSize,
        String additionalNotes
    ) {}

    public record RejectRequest(@NotBlank(message = "Rejection reason is required") String reason) {}

    public record SendOtpRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid address") String email
    ) {}

    public record VerifyOtpRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid address") String email,
        @NotBlank(message = "OTP is required") String otp
    ) {}

    public record WorkspaceRequestSummary(
        Long id,
        String projectName,
        String organizationName,
        String projectDescription,
        String backendTech,
        String frontendTech,
        String databaseTech,
        String cicdTool,
        List<String> requestedModules,
        String workspaceName,
        String preferredWorkspaceSlug,
        String projectManagerName,
        String email,
        String phone,
        Integer expectedTeamSize,
        String additionalNotes,
        WorkspaceRequestStatus status,
        String rejectionReason,
        Instant createdAt,
        Instant reviewedAt
    ) {
        public static WorkspaceRequestSummary from(WorkspaceRequest r) {
            List<String> modules = r.getRequestedModules() == null || r.getRequestedModules().isBlank()
                ? List.of()
                : List.of(r.getRequestedModules().split(","));
            return new WorkspaceRequestSummary(
                r.getId(), r.getProjectName(), r.getOrganizationName(), r.getProjectDescription(),
                r.getBackendTech(), r.getFrontendTech(), r.getDatabaseTech(), r.getCicdTool(),
                modules, r.getWorkspaceName(), r.getPreferredWorkspaceSlug(), r.getProjectManagerName(),
                r.getEmail(), r.getPhone(), r.getExpectedTeamSize(), r.getAdditionalNotes(),
                r.getStatus(), r.getRejectionReason(), r.getCreatedAt(), r.getReviewedAt()
            );
        }
    }

    public record ApprovalResult(
        String projectCode,
        String workspaceCode,
        String projectName,
        String projectAdminUsername,
        String projectAdminTempPassword,
        boolean emailSent
    ) {}
}
