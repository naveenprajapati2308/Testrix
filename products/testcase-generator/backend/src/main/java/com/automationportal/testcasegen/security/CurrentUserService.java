package com.automationportal.testcasegen.security;

import org.springframework.stereotype.Service;

/** Who is making this request — used only for attribution on stored edits, never for access
 * control (that is projectId + roles, see CurrentProjectService and JwtValidationFilter). */
@Service
public class CurrentUserService {
    public Long currentUserId() {
        ProjectContext context = ProjectContextHolder.get();
        return context == null ? null : context.userId();
    }

    public String currentEmail() {
        ProjectContext context = ProjectContextHolder.get();
        return context == null ? null : context.email();
    }
}
