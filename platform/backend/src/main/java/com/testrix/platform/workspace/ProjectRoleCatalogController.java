package com.testrix.platform.workspace;

import com.testrix.platform.common.ApiResponse;
import com.testrix.platform.users.RoleRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/** The subset of the platform Role catalog a Project Admin may assign within their project. */
@RestController
@RequestMapping("/api/projects/roles")
public class ProjectRoleCatalogController {
    private static final Set<String> ASSIGNABLE_ROLE_CODES = Set.of(
        "PROJECT_ADMIN", "QA_LEAD", "TECH_LEAD", "AUTOMATION_ENGINEER", "VIEWER"
    );

    public record RoleOption(String code, String name) {}

    private final RoleRepository roleRepository;

    public ProjectRoleCatalogController(RoleRepository roleRepository) {
        this.roleRepository = roleRepository;
    }

    @GetMapping
    public ApiResponse<List<RoleOption>> list() {
        List<RoleOption> options = roleRepository.findAll().stream()
            .filter(r -> ASSIGNABLE_ROLE_CODES.contains(r.getCode()))
            .map(r -> new RoleOption(r.getCode(), r.getName()))
            .sorted((a, b) -> a.name().compareTo(b.name()))
            .toList();
        return ApiResponse.ok(options);
    }
}
