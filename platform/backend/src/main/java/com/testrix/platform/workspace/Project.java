package com.testrix.platform.workspace;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * A Project *is* a Workspace — the doc's UX language calls it "Workspace", but it's one entity
 * with two business-ID facets ({@link #projectCode} / {@link #workspaceCode}), matching
 * docs/version2.1.md's own "Every Workspace (Project)..." phrasing.
 */
@Entity
@Table(name = "projects")
public class Project {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id")
    private Tenant tenant;

    @Column(name = "project_code")
    private String projectCode;

    @Column(name = "workspace_code")
    private String workspaceCode;

    @Column(name = "preferred_workspace_slug")
    private String preferredWorkspaceSlug;

    private String name;
    private String description;

    @Column(name = "backend_tech")
    private String backendTech;

    @Column(name = "frontend_tech")
    private String frontendTech;

    @Column(name = "database_tech")
    private String databaseTech;

    @Column(name = "cicd_tool")
    private String cicdTool;

    @Enumerated(EnumType.STRING)
    private ProjectStatus status = ProjectStatus.ACTIVE;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private Instant updatedAt;

    protected Project() {
    }

    public Project(Tenant tenant, String projectCode, String workspaceCode, String preferredWorkspaceSlug, String name) {
        this.tenant = tenant;
        this.projectCode = projectCode;
        this.workspaceCode = workspaceCode;
        this.preferredWorkspaceSlug = preferredWorkspaceSlug;
        this.name = name;
    }

    public Long getId() { return id; }
    public Tenant getTenant() { return tenant; }
    public String getProjectCode() { return projectCode; }
    public String getWorkspaceCode() { return workspaceCode; }
    public String getPreferredWorkspaceSlug() { return preferredWorkspaceSlug; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getBackendTech() { return backendTech; }
    public void setBackendTech(String backendTech) { this.backendTech = backendTech; }
    public String getFrontendTech() { return frontendTech; }
    public void setFrontendTech(String frontendTech) { this.frontendTech = frontendTech; }
    public String getDatabaseTech() { return databaseTech; }
    public void setDatabaseTech(String databaseTech) { this.databaseTech = databaseTech; }
    public String getCicdTool() { return cicdTool; }
    public void setCicdTool(String cicdTool) { this.cicdTool = cicdTool; }
    public ProjectStatus getStatus() { return status; }
    public void setStatus(ProjectStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
