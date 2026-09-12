
package com.testrix.platform.users;

import com.testrix.platform.audit.AuditAction;
import com.testrix.platform.audit.AuditService;
import com.testrix.platform.common.ApiResponse;
import com.testrix.platform.common.EntityIdGeneratorService;
import com.testrix.platform.workspace.Project;
import com.testrix.platform.workspace.ProjectUser;
import com.testrix.platform.workspace.ProjectUserRepository;
import com.testrix.platform.workspace.ProjectUserStatus;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin-only user management endpoints.
 * All routes under /api/admin/** are restricted to SUPER_ADMIN by SecurityConfig.
 */
@RestController
@RequestMapping("/api/admin/users")
public class UserManagementController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;
    private final JdbcTemplate jdbcTemplate;
    private final EntityIdGeneratorService entityIdGeneratorService;
    private final ProjectUserRepository projectUserRepository;

    public UserManagementController(UserRepository userRepository,
                                    PasswordEncoder passwordEncoder,
                                    AuditService auditService,
                                    JdbcTemplate jdbcTemplate,
                                    EntityIdGeneratorService entityIdGeneratorService,
                                    ProjectUserRepository projectUserRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditService = auditService;
        this.jdbcTemplate = jdbcTemplate;
        this.entityIdGeneratorService = entityIdGeneratorService;
        this.projectUserRepository = projectUserRepository;
    }

    /** List all users (paginated result kept simple for now). */
    @GetMapping
    public ApiResponse<List<UserProfileDto>> listUsers() {
        List<UserProfileDto> users = userRepository.findAll()
            .stream()
            .map(UserProfileDto::from)
            .toList();
        return ApiResponse.ok(users);
    }

    /** Get single user detail. */
    @GetMapping("/{id}")
    public ApiResponse<UserProfileDto> getUser(@PathVariable Long id) {
        User user = findUser(id);
        return ApiResponse.ok(UserProfileDto.from(user));
    }

    /**
     * Every workspace this user belongs to and their role(s) in each — a user can be a member of
     * several projects (e.g. Project Admin in one, Viewer in another), which the platform-level
     * {@code users.role} field alone can't express. Backs the "View" action on Manage Users.
     */
    @GetMapping("/{id}/workspaces")
    @Transactional(readOnly = true)
    public ApiResponse<List<UserManagementDtos.UserWorkspaceMembership>> getUserWorkspaces(@PathVariable Long id) {
        findUser(id);
        Map<Long, List<ProjectUser>> byProject = projectUserRepository.findByUserId(id).stream()
            .collect(Collectors.groupingBy(pu -> pu.getProject().getId()));
        List<UserManagementDtos.UserWorkspaceMembership> memberships = byProject.values().stream()
            .map(rows -> {
                Project project = rows.get(0).getProject();
                List<String> roles = rows.stream().map(pu -> pu.getRole().getCode()).distinct().toList();
                boolean anyActive = rows.stream().anyMatch(pu -> pu.getStatus() == ProjectUserStatus.ACTIVE);
                return new UserManagementDtos.UserWorkspaceMembership(
                    project.getId(), project.getProjectCode(), project.getWorkspaceCode(), project.getName(),
                    project.getStatus().name(), roles, anyActive ? "ACTIVE" : "DISABLED"
                );
            })
            .sorted(Comparator.comparing(UserManagementDtos.UserWorkspaceMembership::projectName))
            .toList();
        return ApiResponse.ok(memberships);
    }

    /** Create a new user — only admins can do this; no self-registration exists. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<UserProfileDto> createUser(@Valid @RequestBody UserManagementDtos.CreateUserRequest request,
                                                  HttpServletRequest servletRequest) {
        if (userRepository.existsByUsername(request.username())) {
            throw new IllegalArgumentException("Username already exists");
        }
        String email = normalizeOptional(request.email());
        if (email != null && userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email already exists");
        }
        // A username that matches another account's email (or vice versa) makes login-by-that-string
        // ambiguous — findByUsernameOrEmail would match two rows and blow up at login time.
        if (userRepository.existsByEmail(request.username())) {
            throw new IllegalArgumentException("Username can't be the same as another account's email");
        }
        if (email != null && userRepository.existsByUsername(email)) {
            throw new IllegalArgumentException("This email is already in use as another account's username");
        }
        validatePassword(request.password());

        User user = new User();
        user.setUsername(request.username());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDisplayName(request.fullName() != null ? request.fullName() : request.username());
        user.setMobileNumber(request.mobileNumber());
        user.setDesignation(request.designation());
        user.setOrganization(request.organization());
        user.setRole(request.role() != null ? request.role() : UserRole.VIEWER);
        user.setStatus(UserStatus.ACTIVE);
        user.setEmailVerified(true);
        user.setAuthProvider("LOCAL");
        user.setBusinessId(entityIdGeneratorService.next("USR"));
        userRepository.save(user);

        auditService.record(user, AuditAction.USER_CREATE, "User created by admin", servletRequest);
        return ApiResponse.created("User created", UserProfileDto.from(user));
    }

    /** Update user info fields. */
    @PutMapping("/{id}")
    public ApiResponse<UserProfileDto> updateUser(@PathVariable Long id,
                                                  @Valid @RequestBody UserManagementDtos.UpdateUserRequest request,
                                                  HttpServletRequest servletRequest) {
        User user = findUser(id);
        user.setDisplayName(request.fullName().trim());
        user.setMobileNumber(request.mobileNumber().trim());
        user.setDesignation(request.designation().trim());
        if (request.organization() != null) user.setOrganization(request.organization());
        userRepository.save(user);
        auditService.record(user, AuditAction.USER_UPDATE, "User updated by admin", servletRequest);
        return ApiResponse.ok(UserProfileDto.from(user));
    }

    /** Disable (deactivate) a user account. */
    @PutMapping("/{id}/disable")
    public ApiResponse<UserProfileDto> disableUser(@PathVariable Long id, HttpServletRequest servletRequest) {
        User user = findUser(id);
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            throw new IllegalArgumentException("Cannot disable the Super Admin account");
        }
        user.setStatus(UserStatus.DISABLED);
        userRepository.save(user);
        auditService.record(user, AuditAction.USER_DISABLE, "User disabled by admin", servletRequest);
        return ApiResponse.ok(UserProfileDto.from(user));
    }

    /** Enable (reactivate) a user account. */
    @PutMapping("/{id}/enable")
    public ApiResponse<UserProfileDto> enableUser(@PathVariable Long id, HttpServletRequest servletRequest) {
        User user = findUser(id);
        user.setStatus(UserStatus.ACTIVE);
        userRepository.save(user);
        auditService.record(user, AuditAction.USER_ENABLE, "User enabled by admin", servletRequest);
        return ApiResponse.ok(UserProfileDto.from(user));
    }

    /** Force-reset a user's password. */
    @PutMapping("/{id}/reset-password")
    public ApiResponse<UserProfileDto> resetPassword(@PathVariable Long id,
                                                     @Valid @RequestBody UserManagementDtos.ResetPasswordRequest request,
                                                     HttpServletRequest servletRequest) {
        validatePassword(request.newPassword());
        User user = findUser(id);
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
        auditService.record(user, AuditAction.USER_PASSWORD_RESET, "Password reset by admin", servletRequest);
        return ApiResponse.ok(UserProfileDto.from(user));
    }

    /** Assign a new role to a user. */
    @PutMapping("/{id}/role")
    public ApiResponse<UserProfileDto> assignRole(@PathVariable Long id,
                                                  @Valid @RequestBody UserManagementDtos.AssignRoleRequest request,
                                                  HttpServletRequest servletRequest) {
        User user = findUser(id);
        if (user.getRole() == UserRole.SUPER_ADMIN && request.role() != UserRole.SUPER_ADMIN) {
            throw new IllegalArgumentException("Cannot change the Super Admin role");
        }
        user.setRole(request.role());
        userRepository.save(user);
        auditService.record(user, AuditAction.ROLE_CHANGE, "Role changed to " + request.role() + " by admin", servletRequest);
        return ApiResponse.ok(UserProfileDto.from(user));
    }

    /** Delete a user permanently. SUPER_ADMIN accounts cannot be deleted. */
    @DeleteMapping("/{id}")
    @Transactional
    public ApiResponse<Void> deleteUser(@PathVariable Long id, HttpServletRequest servletRequest) {
        User user = findUser(id);
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            throw new IllegalArgumentException("Cannot delete the Super Admin account");
        }

        // docs/version2.1.md "Project Administration Protection": never leave a workspace with
        // zero active Project Admins — mirrors ProjectUserController.guardLastProjectAdmin at this,
        // the platform-level delete entry point.
        List<Long> soleAdminProjects = jdbcTemplate.query(
            "SELECT pu.project_id FROM project_users pu " +
            "JOIN roles r ON r.id = pu.role_id " +
            "WHERE pu.user_id = ? AND r.code = 'PROJECT_ADMIN' AND pu.status = 'ACTIVE' " +
            "AND (SELECT COUNT(*) FROM project_users pu2 JOIN roles r2 ON r2.id = pu2.role_id " +
            "     WHERE pu2.project_id = pu.project_id AND r2.code = 'PROJECT_ADMIN' AND pu2.status = 'ACTIVE') <= 1",
            (rs, rowNum) -> rs.getLong("project_id"), id);
        if (!soleAdminProjects.isEmpty()) {
            throw new IllegalArgumentException(
                "This user is the only active Project Admin of at least one workspace — assign another Project Admin there first");
        }

        // Record audit event first, while the user exists
        auditService.record(user, AuditAction.USER_DELETE, "User deleted by admin", servletRequest);

        // Clean up database foreign key constraint references
        jdbcTemplate.update("DELETE FROM user_roles WHERE user_id = ?", id);
        jdbcTemplate.update("DELETE FROM refresh_tokens WHERE user_id = ?", id);
        jdbcTemplate.update("DELETE FROM project_users WHERE user_id = ?", id);
        jdbcTemplate.update("UPDATE audit_logs SET user_id = NULL WHERE user_id = ?", id);
        jdbcTemplate.update("UPDATE workspace_requests SET reviewed_by = NULL WHERE reviewed_by = ?", id);
        jdbcTemplate.update("UPDATE executions SET triggered_by = (SELECT MIN(id) FROM users WHERE role = 'SUPER_ADMIN') WHERE triggered_by = ?", id);

        // Delete user
        userRepository.deleteById(id);
        
        return ApiResponse.ok(null);
    }

    private User findUser(Long id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private String normalizeOptional(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters");
        }
    }
}
