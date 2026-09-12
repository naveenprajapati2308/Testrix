package com.testrix.platform.workspace;

import com.testrix.platform.common.ApiResponse;
import com.testrix.platform.users.RoleRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/**
 * Super Admin's view of the project role catalog (docs/version2.2.md "ROLE MANAGEMENT": only
 * Super Admin defines Roles/Permission Sets/System Permissions — a Project Admin only assigns
 * these predefined roles within their own workspace via Team Management, never creates new
 * ones). Read-only for v1 — the catalog is fixed/seeded via migration, not authored here,
 * matching "do not over-engineer permission differences now" (docs/version2.2.md). Already
 * covered by SecurityConfig's blanket /api/admin/** -> hasRole("SUPER_ADMIN") rule.
 */
@RestController
@RequestMapping("/api/admin/roles")
public class AdminRoleController {
    private static final Set<String> PROJECT_ROLE_CODES = Set.of(
        "PROJECT_ADMIN", "QA_LEAD", "TECH_LEAD", "AUTOMATION_ENGINEER", "VIEWER"
    );

    public record RoleUsage(String code, String name, String description, long activeAssignments) {}

    private final RoleRepository roleRepository;
    private final ProjectUserRepository projectUserRepository;

    public AdminRoleController(RoleRepository roleRepository, ProjectUserRepository projectUserRepository) {
        this.roleRepository = roleRepository;
        this.projectUserRepository = projectUserRepository;
    }

    @GetMapping
    public ApiResponse<List<RoleUsage>> list() {
        List<RoleUsage> roles = roleRepository.findAll().stream()
            .filter(r -> PROJECT_ROLE_CODES.contains(r.getCode()))
            .map(r -> new RoleUsage(r.getCode(), r.getName(), r.getDescription(),
                projectUserRepository.countByRoleCodeAndStatus(r.getCode(), ProjectUserStatus.ACTIVE)))
            .sorted((a, b) -> a.name().compareTo(b.name()))
            .toList();
        return ApiResponse.ok(roles);
    }
}
