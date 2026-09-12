package com.testrix.platform.workspace;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "tenants")
public class Tenant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_code")
    private String tenantCode;

    private String name;

    @Enumerated(EnumType.STRING)
    private TenantStatus status = TenantStatus.ACTIVE;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    protected Tenant() {
    }

    public Tenant(String tenantCode, String name) {
        this.tenantCode = tenantCode;
        this.name = name;
    }

    public Long getId() { return id; }
    public String getTenantCode() { return tenantCode; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public TenantStatus getStatus() { return status; }
    public void setStatus(TenantStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
}
