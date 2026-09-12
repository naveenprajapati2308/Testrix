package com.testrix.platform.workspace;

import com.testrix.platform.audit.AuditAction;
import com.testrix.platform.audit.AuditService;
import com.testrix.platform.auth.AuthenticatedUserService;
import com.testrix.platform.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;

/**
 * Super Admin review queue for workspace requests. Already covered by SecurityConfig's blanket
 * /api/admin/** -> hasRole("SUPER_ADMIN") rule — no SecurityConfig change needed.
 */
@RestController
@RequestMapping("/api/admin/workspace-requests")
public class AdminWorkspaceRequestController {
    private final WorkspaceRequestRepository repository;
    private final WorkspaceProvisioningService provisioningService;
    private final AuthenticatedUserService authenticatedUserService;
    private final AuditService auditService;

    public AdminWorkspaceRequestController(WorkspaceRequestRepository repository,
                                            WorkspaceProvisioningService provisioningService,
                                            AuthenticatedUserService authenticatedUserService,
                                            AuditService auditService) {
        this.repository = repository;
        this.provisioningService = provisioningService;
        this.authenticatedUserService = authenticatedUserService;
        this.auditService = auditService;
    }

    @GetMapping
    public ApiResponse<List<WorkspaceRequestDtos.WorkspaceRequestSummary>> list(
        @RequestParam(required = false) WorkspaceRequestStatus status) {
        List<WorkspaceRequest> requests = status != null
            ? repository.findByStatusOrderByCreatedAtDesc(status)
            : repository.findAllByOrderByCreatedAtDesc();
        return ApiResponse.ok(requests.stream().map(WorkspaceRequestDtos.WorkspaceRequestSummary::from).toList());
    }

    @PostMapping("/{id}/approve")
    public ApiResponse<WorkspaceRequestDtos.ApprovalResult> approve(@PathVariable Long id, HttpServletRequest servletRequest) {
        WorkspaceRequest request = findRequest(id);
        var reviewer = authenticatedUserService.currentUser();
        WorkspaceRequestDtos.ApprovalResult result = provisioningService.approve(request, reviewer);
        auditService.record(reviewer, AuditAction.WORKSPACE_APPROVED,
            "Workspace \"" + request.getWorkspaceName() + "\" approved", servletRequest);
        return ApiResponse.ok(result);
    }

    @PostMapping("/{id}/reject")
    public ApiResponse<WorkspaceRequestDtos.WorkspaceRequestSummary> reject(
        @PathVariable Long id, @Valid @RequestBody WorkspaceRequestDtos.RejectRequest request, HttpServletRequest servletRequest) {
        WorkspaceRequest entity = findRequest(id);
        var reviewer = authenticatedUserService.currentUser();
        provisioningService.reject(entity, reviewer, request.reason());
        auditService.record(reviewer, AuditAction.WORKSPACE_REJECTED,
            "Workspace \"" + entity.getWorkspaceName() + "\" rejected", servletRequest);
        return ApiResponse.ok(WorkspaceRequestDtos.WorkspaceRequestSummary.from(entity));
    }

    private WorkspaceRequest findRequest(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workspace request not found"));
    }
}
