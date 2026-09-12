package com.automationportal.modules;

import com.automationportal.common.ApiResponse;
import com.automationportal.security.CurrentProjectService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/modules")
public class ModuleAdminController {

    private final ModuleRepository repository;
    private final CurrentProjectService currentProjectService;

    public ModuleAdminController(ModuleRepository repository, CurrentProjectService currentProjectService) {
        this.repository = repository;
        this.currentProjectService = currentProjectService;
    }

    @GetMapping
    public ApiResponse<List<ModuleEntity>> list() {
        return ApiResponse.ok(repository.findAll());
    }

    @PostMapping
    public ApiResponse<ModuleEntity> create(@RequestBody ModuleEntity body) {
        String runnerType = body.getRunnerType() != null && !body.getRunnerType().isBlank()
                ? body.getRunnerType() : "MAVEN_TESTNG";
        if (repository.findByCodeAndRunnerType(body.getCode(), runnerType).isPresent()) {
            throw new IllegalArgumentException(
                    "A " + runnerType + " module with code '" + body.getCode() + "' already exists.");
        }
        ModuleEntity m = new ModuleEntity(body.getCode(), body.getName());
        // Super Admin has no project context of its own (excluded from project_users by design),
        // so an explicit target project must be named in the request — this is the only way any
        // project other than the Default Workspace (MPHIDB) can ever get a module registered.
        // Falls back to the Default Workspace when omitted so every pre-multi-project caller
        // (today's Manage Modules UI has no project picker yet) keeps working unchanged.
        m.setProjectId(body.getProjectId() != null ? body.getProjectId() : currentProjectService.defaultWorkspaceProjectId());
        m.setDescription(body.getDescription());
        m.setXmlFile(body.getXmlFile());
        m.setReportPath(body.getReportPath());
        m.setVisible(body.isVisible());
        m.setAllowedRoles(body.getAllowedRoles());
        m.setRunnerType(runnerType);
        m.setParentModuleId(body.getParentModuleId());
        m.setTestEngineId(body.getTestEngineId());
        return ApiResponse.ok(repository.save(m));
    }

    @PutMapping("/{id}")
    public ApiResponse<ModuleEntity> update(@PathVariable Long id, @RequestBody ModuleEntity body) {
        ModuleEntity m = repository.findById(id).orElseThrow();
        m.setName(body.getName());
        m.setDescription(body.getDescription());
        m.setXmlFile(body.getXmlFile());
        m.setReportPath(body.getReportPath());
        m.setVisible(body.isVisible());
        m.setAllowedRoles(body.getAllowedRoles());
        m.setActive(body.isActive());
        m.setParentModuleId(body.getParentModuleId());
        m.setTestEngineId(body.getTestEngineId());
        if (body.getRunnerType() != null && !body.getRunnerType().isBlank()) {
            m.setRunnerType(body.getRunnerType());
        }
        return ApiResponse.ok(repository.save(m));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        repository.deleteById(id);
        return ApiResponse.ok(null);
    }

    @PatchMapping("/{id}/toggle")
    public ApiResponse<ModuleEntity> toggle(@PathVariable Long id) {
        ModuleEntity m = repository.findById(id).orElseThrow();
        m.setActive(!m.isActive());
        return ApiResponse.ok(repository.save(m));
    }

    @GetMapping("/test-connection")
    public ApiResponse<Map<String, Object>> testConnection() {
        long count = repository.count();
        return ApiResponse.ok(Map.of("modulesInDb", count, "status", "ok"));
    }
}
