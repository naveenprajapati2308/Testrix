package com.testrix.platform.workspace;

import com.testrix.platform.users.Role;
import com.testrix.platform.users.User;
import jakarta.persistence.*;

import java.time.Instant;

/**
 * One row = one (project, user, role) grant. A user can hold several rows across several
 * projects, and several roles within one project — this table alone is the entire "same user,
 * different role per project" model from docs/version2.1.md, no special-casing needed.
 */
@Entity
@Table(name = "project_users")
public class ProjectUser {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id")
    private Role role;

    @Enumerated(EnumType.STRING)
    private ProjectUserStatus status = ProjectUserStatus.ACTIVE;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private Instant updatedAt;

    protected ProjectUser() {
    }

    public ProjectUser(Project project, User user, Role role) {
        this.project = project;
        this.user = user;
        this.role = role;
    }

    public Long getId() { return id; }
    public Project getProject() { return project; }
    public User getUser() { return user; }
    public Role getRole() { return role; }
    public ProjectUserStatus getStatus() { return status; }
    public void setStatus(ProjectUserStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
