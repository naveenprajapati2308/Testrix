package com.testrix.platform.workspace;

import java.util.List;

/** Tenant/Project/role context resolved from the current request's JWT claims. */
public record ProjectContext(Long tenantId, Long projectId, String projectCode, List<String> projectRoles) {
    public boolean hasRole(String roleCode) {
        return projectRoles != null && projectRoles.contains(roleCode);
    }
}
