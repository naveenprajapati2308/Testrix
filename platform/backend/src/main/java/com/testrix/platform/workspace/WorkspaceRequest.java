package com.testrix.platform.workspace;

import com.testrix.platform.users.User;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "workspace_requests")
public class WorkspaceRequest {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_name")
    private String projectName;

    @Column(name = "organization_name")
    private String organizationName;

    @Column(name = "project_description")
    private String projectDescription;

    @Column(name = "backend_tech")
    private String backendTech;

    @Column(name = "frontend_tech")
    private String frontendTech;

    @Column(name = "database_tech")
    private String databaseTech;

    @Column(name = "cicd_tool")
    private String cicdTool;

    /** CSV of {@link ProjectModuleType} values requested. */
    @Column(name = "requested_modules")
    private String requestedModules;

    @Column(name = "workspace_name")
    private String workspaceName;

    @Column(name = "preferred_workspace_slug")
    private String preferredWorkspaceSlug;

    @Column(name = "project_manager_name")
    private String projectManagerName;

    private String email;
    private String phone;

    @Column(name = "expected_team_size")
    private Integer expectedTeamSize;

    @Column(name = "additional_notes")
    private String additionalNotes;

    @Enumerated(EnumType.STRING)
    private WorkspaceRequestStatus status = WorkspaceRequestStatus.PENDING;

    @Column(name = "rejection_reason")
    private String rejectionReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resulting_project_id")
    private Project resultingProject;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private Instant updatedAt;

    protected WorkspaceRequest() {
    }

    public Long getId() { return id; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }
    public String getOrganizationName() { return organizationName; }
    public void setOrganizationName(String organizationName) { this.organizationName = organizationName; }
    public String getProjectDescription() { return projectDescription; }
    public void setProjectDescription(String projectDescription) { this.projectDescription = projectDescription; }
    public String getBackendTech() { return backendTech; }
    public void setBackendTech(String backendTech) { this.backendTech = backendTech; }
    public String getFrontendTech() { return frontendTech; }
    public void setFrontendTech(String frontendTech) { this.frontendTech = frontendTech; }
    public String getDatabaseTech() { return databaseTech; }
    public void setDatabaseTech(String databaseTech) { this.databaseTech = databaseTech; }
    public String getCicdTool() { return cicdTool; }
    public void setCicdTool(String cicdTool) { this.cicdTool = cicdTool; }
    public String getRequestedModules() { return requestedModules; }
    public void setRequestedModules(String requestedModules) { this.requestedModules = requestedModules; }
    public String getWorkspaceName() { return workspaceName; }
    public void setWorkspaceName(String workspaceName) { this.workspaceName = workspaceName; }
    public String getPreferredWorkspaceSlug() { return preferredWorkspaceSlug; }
    public void setPreferredWorkspaceSlug(String preferredWorkspaceSlug) { this.preferredWorkspaceSlug = preferredWorkspaceSlug; }
    public String getProjectManagerName() { return projectManagerName; }
    public void setProjectManagerName(String projectManagerName) { this.projectManagerName = projectManagerName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public Integer getExpectedTeamSize() { return expectedTeamSize; }
    public void setExpectedTeamSize(Integer expectedTeamSize) { this.expectedTeamSize = expectedTeamSize; }
    public String getAdditionalNotes() { return additionalNotes; }
    public void setAdditionalNotes(String additionalNotes) { this.additionalNotes = additionalNotes; }
    public WorkspaceRequestStatus getStatus() { return status; }
    public void setStatus(WorkspaceRequestStatus status) { this.status = status; }
    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }
    public User getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(User reviewedBy) { this.reviewedBy = reviewedBy; }
    public Instant getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(Instant reviewedAt) { this.reviewedAt = reviewedAt; }
    public Project getResultingProject() { return resultingProject; }
    public void setResultingProject(Project resultingProject) { this.resultingProject = resultingProject; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
