package com.automationportal.testcasegen.security;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Every project-scoped endpoint resolves "which project am I in" through here — Super Admin
 * (no project claim) and a user pending workspace selection are correctly refused rather than
 * silently shown cross-project data. */
@Service
public class CurrentProjectService {
    public Long requireProjectId() {
        ProjectContext context = ProjectContextHolder.get();
        if (context == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This view requires an active project workspace");
        }
        return context.projectId();
    }
}
