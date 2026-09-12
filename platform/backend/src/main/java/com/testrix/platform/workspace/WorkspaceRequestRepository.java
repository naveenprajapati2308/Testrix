package com.testrix.platform.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface WorkspaceRequestRepository extends JpaRepository<WorkspaceRequest, Long> {
    List<WorkspaceRequest> findByStatusOrderByCreatedAtDesc(WorkspaceRequestStatus status);
    List<WorkspaceRequest> findAllByOrderByCreatedAtDesc();
    boolean existsByPreferredWorkspaceSlugIgnoreCaseAndStatus(String preferredWorkspaceSlug, WorkspaceRequestStatus status);

    // workspaceName lives only on the request (never copied onto Project), so "already in use"
    // means "already claimed by a live request" — PENDING (awaiting review) or APPROVED (already
    // provisioned) — not REJECTED, which frees the name back up.
    boolean existsByWorkspaceNameIgnoreCaseAndStatusIn(String workspaceName, Collection<WorkspaceRequestStatus> statuses);
}
