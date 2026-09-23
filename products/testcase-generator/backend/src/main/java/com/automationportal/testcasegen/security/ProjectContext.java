package com.automationportal.testcasegen.security;

import java.util.List;

/** Tenant/Project/role context resolved from the current request's JWT claims (same claim shape
 * as every other Testrix product — separate copy since this is a different Spring Boot service).
 *
 * Carries userId/email as well, because every test-case edit is attributed to a real user in
 * test_case_review_history. */
public record ProjectContext(Long tenantId, Long projectId, String projectCode, List<String> projectRoles,
                             Long userId, String email) {
    public boolean hasRole(String roleCode) {
        return projectRoles != null && projectRoles.contains(roleCode);
    }
}
