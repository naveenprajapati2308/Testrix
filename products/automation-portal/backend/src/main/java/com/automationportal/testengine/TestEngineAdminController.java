package com.automationportal.testengine;

import com.automationportal.common.ApiResponse;
import com.automationportal.security.CurrentProjectService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Read-only view of the Default Workspace's registered Test Engines, for Manage Modules' engine
 * picker. Super Admin has no project context of its own (see CurrentProjectService javadoc) —
 * same precedent as ModuleAdminController stamping admin-created Modules into the Default
 * Workspace project. Registration/credential management stays exclusively under
 * TestEngineController's regular project-scoped endpoints (Project Admin only).
 */
@RestController
@RequestMapping("/api/admin/test-engines")
public class TestEngineAdminController {
    private final TestEngineRepository repository;
    private final TestEngineCredentialService credentialService;
    private final CurrentProjectService currentProjectService;

    public TestEngineAdminController(TestEngineRepository repository,
                                     TestEngineCredentialService credentialService,
                                     CurrentProjectService currentProjectService) {
        this.repository = repository;
        this.credentialService = credentialService;
        this.currentProjectService = currentProjectService;
    }

    @GetMapping
    public ApiResponse<List<TestEngineDtos.Summary>> list() {
        Long projectId = currentProjectService.defaultWorkspaceProjectId();
        return ApiResponse.ok(repository.findByProjectId(projectId).stream()
                .map(e -> TestEngineDtos.Summary.from(e, credentialService.activeKeyPrefix(e.getId()).orElse(null)))
                .toList());
    }
}
