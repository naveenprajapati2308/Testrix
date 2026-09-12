package com.testrix.platform.workspace;

import com.testrix.platform.audit.AuditAction;
import com.testrix.platform.audit.AuditService;
import com.testrix.platform.auth.OtpPurpose;
import com.testrix.platform.auth.OtpService;
import com.testrix.platform.auth.OtpVerificationRepository;
import com.testrix.platform.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Public "Request Workspace" submission (docs/version2.1.md's Workspace Request Flow). Added to
 * SecurityConfig's permitAll list — anyone can submit, only a Super Admin can approve/reject
 * (see AdminWorkspaceController, covered by the existing /api/admin/** rule).
 *
 * The contact email must be OTP-verified (OtpPurpose.REGISTRATION) before a request can be
 * submitted, so a Super Admin never reviews a request built on an email the requester doesn't
 * actually control.
 */
@RestController
@RequestMapping("/api/workspace-requests")
public class WorkspaceRequestController {
    private final WorkspaceRequestRepository repository;
    private final ProjectRepository projectRepository;
    private final OtpService otpService;
    private final OtpVerificationRepository otpVerificationRepository;
    private final AuditService auditService;

    public WorkspaceRequestController(WorkspaceRequestRepository repository, ProjectRepository projectRepository,
                                      OtpService otpService, OtpVerificationRepository otpVerificationRepository,
                                      AuditService auditService) {
        this.repository = repository;
        this.projectRepository = projectRepository;
        this.otpService = otpService;
        this.otpVerificationRepository = otpVerificationRepository;
        this.auditService = auditService;
    }

    @PostMapping("/send-otp")
    public ApiResponse<Map<String, String>> sendOtp(@Valid @RequestBody WorkspaceRequestDtos.SendOtpRequest request) {
        otpService.send(request.email(), request.email(), OtpPurpose.REGISTRATION);
        return ApiResponse.ok(Map.of("status", "otp_sent"));
    }

    @PostMapping("/verify-otp")
    public ApiResponse<Map<String, String>> verifyOtp(@Valid @RequestBody WorkspaceRequestDtos.VerifyOtpRequest request) {
        otpService.verify(request.email(), request.otp(), OtpPurpose.REGISTRATION);
        return ApiResponse.ok(Map.of("status", "verified"));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Map<String, Object>> submit(@Valid @RequestBody WorkspaceRequestDtos.SubmitRequest request,
                                                     HttpServletRequest servletRequest) {
        if (!otpVerificationRepository.existsByEmailAndPurposeAndVerifiedTrue(request.email(), OtpPurpose.REGISTRATION)) {
            throw new IllegalArgumentException("Please verify your email with the OTP sent to it before submitting");
        }
        if (projectRepository.existsByNameIgnoreCase(request.projectName())) {
            throw new IllegalArgumentException("A project named '" + request.projectName() + "' already exists");
        }
        if (projectRepository.existsByPreferredWorkspaceSlugIgnoreCase(request.preferredWorkspaceSlug())) {
            throw new IllegalArgumentException("Workspace code '" + request.preferredWorkspaceSlug() + "' is already in use");
        }
        if (repository.existsByPreferredWorkspaceSlugIgnoreCaseAndStatus(request.preferredWorkspaceSlug(), WorkspaceRequestStatus.PENDING)) {
            throw new IllegalArgumentException("A pending request already uses workspace code '" + request.preferredWorkspaceSlug() + "'");
        }
        if (repository.existsByWorkspaceNameIgnoreCaseAndStatusIn(request.workspaceName(),
                List.of(WorkspaceRequestStatus.PENDING, WorkspaceRequestStatus.APPROVED))) {
            throw new IllegalArgumentException("Workspace name '" + request.workspaceName() + "' is already in use");
        }

        WorkspaceRequest entity = new WorkspaceRequest();
        entity.setProjectName(request.projectName());
        entity.setOrganizationName(request.organizationName());
        entity.setProjectDescription(request.projectDescription());
        entity.setBackendTech(request.backendTech());
        entity.setFrontendTech(request.frontendTech());
        entity.setDatabaseTech(request.databaseTech());
        entity.setCicdTool(request.cicdTool());
        entity.setRequestedModules(request.requestedModules().stream().map(Enum::name).collect(Collectors.joining(",")));
        entity.setWorkspaceName(request.workspaceName());
        entity.setPreferredWorkspaceSlug(request.preferredWorkspaceSlug());
        entity.setProjectManagerName(request.projectManagerName());
        entity.setEmail(request.email());
        entity.setPhone(request.phone());
        entity.setExpectedTeamSize(request.expectedTeamSize());
        entity.setAdditionalNotes(request.additionalNotes());
        repository.save(entity);
        auditService.record(null, AuditAction.WORKSPACE_REQUESTED,
            "Workspace \"" + entity.getWorkspaceName() + "\" requested by " + entity.getProjectManagerName(), servletRequest);

        return ApiResponse.created("Workspace request submitted — a Super Admin will review it shortly",
            Map.of("id", entity.getId(), "status", entity.getStatus()));
    }
}
