package com.testrix.platform.users;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * The platform-level role catalog (table existed since V2 but was never mapped to an entity —
 * every authorization check used {@link UserRole} instead). Now backs project-scoped role
 * assignment via {@code project_users}. Only Super Admin manages this catalog; nothing here is
 * mutated by project-level code.
 */
@Entity
@Table(name = "roles")
public class Role {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String code;
    private String name;
    private String description;

    @Column(name = "business_id")
    private String businessId;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    protected Role() {
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getBusinessId() { return businessId; }
    public void setBusinessId(String businessId) { this.businessId = businessId; }
    public Instant getCreatedAt() { return createdAt; }
}
