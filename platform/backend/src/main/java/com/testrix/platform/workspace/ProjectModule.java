package com.testrix.platform.workspace;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "project_modules")
public class ProjectModule {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @Enumerated(EnumType.STRING)
    @Column(name = "module_type")
    private ProjectModuleType moduleType;

    private boolean enabled = true;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    protected ProjectModule() {
    }

    public ProjectModule(Project project, ProjectModuleType moduleType, boolean enabled) {
        this.project = project;
        this.moduleType = moduleType;
        this.enabled = enabled;
    }

    public Long getId() { return id; }
    public Project getProject() { return project; }
    public ProjectModuleType getModuleType() { return moduleType; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Instant getCreatedAt() { return createdAt; }
}
