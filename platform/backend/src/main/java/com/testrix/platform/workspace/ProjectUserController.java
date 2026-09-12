package com.testrix.platform.workspace;

import com.testrix.platform.auth.AuthenticatedUserService;
import com.testrix.platform.mail.MailService;
import com.testrix.platform.common.ApiResponse;
import com.testrix.platform.common.EntityIdGeneratorService;
import com.testrix.platform.common.TempPasswordGenerator;
import com.testrix.platform.users.Role;
import com.testrix.platform.users.RoleRepository;
import com.testrix.platform.users.User;
import com.testrix.platform.users.UserRepository;
import com.testrix.platform.users.UserRole;
import com.testrix.platform.users.UserStatus;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/projects/{projectId}/users")
public class ProjectUserController {
    private static final Logger log = LoggerFactory.getLogger(ProjectUserController.class);
    private static final Set<String> ASSIGNABLE_ROLE_CODES = Set.of(
        "PROJECT_ADMIN", "QA_LEAD", "TECH_LEAD", "AUTOMATION_ENGINEER", "VIEWER"
    );

    private final ProjectRepository projectRepository;
    private final ProjectUserRepository projectUserRepository;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final EntityIdGeneratorService entityIdGeneratorService;
    private final AuthenticatedUserService authenticatedUserService;
    private final MailService mailService;
    private final String frontendUrl;

    public ProjectUserController(ProjectRepository projectRepository,
                                 ProjectUserRepository projectUserRepository,
                                 UserRepository userRepository,
                                 RoleRepository roleRepository,
                                 PasswordEncoder passwordEncoder,
                                 EntityIdGeneratorService entityIdGeneratorService,
                                 AuthenticatedUserService authenticatedUserService,
                                 MailService mailService,
                                 @Value("${portal.app.frontend-url}") String frontendUrl) {
        this.projectRepository = projectRepository;
        this.projectUserRepository = projectUserRepository;
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.entityIdGeneratorService = entityIdGeneratorService;
        this.authenticatedUserService = authenticatedUserService;
        this.mailService = mailService;
        this.frontendUrl = frontendUrl;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ApiResponse<List<ProjectUserDtos.ProjectUserSummary>> list(@PathVariable Long projectId) {
        requireProjectAccess(projectId);
        return ApiResponse.ok(summarize(projectUserRepository.findByProjectId(projectId)));
    }

  
    @GetMapping("/{userId}/shared-workspaces")
    @Transactional(readOnly = true)
    public ApiResponse<List<ProjectUserDtos.SharedWorkspaceMembership>> sharedWorkspaces(
            @PathVariable Long projectId, @PathVariable Long userId) {
        requireProjectAccess(projectId);
        requireMembership(projectId, userId);

        User current = authenticatedUserService.currentUser();
        Set<Long> adminProjectIds = current.getRole() == UserRole.SUPER_ADMIN ? null
            : projectUserRepository.findByUserId(current.getId()).stream()
                .filter(pu -> pu.getStatus() == ProjectUserStatus.ACTIVE && pu.getRole().getCode().equals("PROJECT_ADMIN"))
                .map(pu -> pu.getProject().getId())
                .collect(Collectors.toSet());

        Map<Long, List<ProjectUser>> byProject = projectUserRepository.findByUserId(userId).stream()
            .filter(pu -> adminProjectIds == null || adminProjectIds.contains(pu.getProject().getId()))
            .collect(Collectors.groupingBy(pu -> pu.getProject().getId()));

        List<ProjectUserDtos.SharedWorkspaceMembership> memberships = byProject.values().stream()
            .map(rows -> {
                Project p = rows.get(0).getProject();
                List<String> roles = rows.stream().map(pu -> pu.getRole().getCode()).distinct().toList();
                boolean anyActive = rows.stream().anyMatch(pu -> pu.getStatus() == ProjectUserStatus.ACTIVE);
                return new ProjectUserDtos.SharedWorkspaceMembership(
                    p.getId(), p.getName(), roles, anyActive ? "ACTIVE" : "DISABLED"
                );
            })
            .sorted(Comparator.comparing(ProjectUserDtos.SharedWorkspaceMembership::projectName))
            .toList();
        return ApiResponse.ok(memberships);
    }

    /** Onboards a user by email — attaches an existing platform identity, or creates a new one. */
    @PostMapping
    @Transactional
    public ApiResponse<ProjectUserDtos.ProjectUserSummary> create(@PathVariable Long projectId,
                                                                   @Valid @RequestBody ProjectUserDtos.CreateProjectUserRequest request) {
        requireProjectAccess(projectId);
        Project project = findProject(projectId);
        List<Role> roles = resolveAssignableRoles(request.roleCodes());
        boolean isNewUser = false;
        String tempPassword = null;

        User user = userRepository.findByEmail(request.email()).orElse(null);
        if (user == null) {
            if (request.username() == null || request.username().isBlank()) {
                throw new IllegalArgumentException("Username is required to create a new user");
            }
            if (request.fullName() == null || request.fullName().isBlank()) {
                throw new IllegalArgumentException("Full name is required to create a new user");
            }
            if (userRepository.existsByUsername(request.username())) {
                throw new IllegalArgumentException("Username already exists");
            }
            // A username that matches another account's email (or vice versa) makes login-by-that-
            // string ambiguous — findByUsernameOrEmail would match two rows and blow up at login time.
            if (userRepository.existsByEmail(request.username())) {
                throw new IllegalArgumentException("Username can't be the same as another account's email");
            }
            if (userRepository.existsByUsername(request.email())) {
                throw new IllegalArgumentException("This email is already in use as another account's username");
            }
            isNewUser = true;
            tempPassword = TempPasswordGenerator.generate();
            user = new User();
            user.setUsername(request.username());
            user.setEmail(request.email());
            user.setPasswordHash(passwordEncoder.encode(tempPassword));
            user.setDisplayName(request.fullName());
            user.setMobileNumber(request.mobileNumber());
            user.setRole(UserRole.VIEWER);
            user.setStatus(UserStatus.ACTIVE);
            user.setEmailVerified(true);
            user.setAuthProvider("LOCAL");
            user.setBusinessId(entityIdGeneratorService.next("USR"));
            userRepository.save(user);
        } else if (user.getRole() == UserRole.SUPER_ADMIN) {
            throw new IllegalArgumentException("The Super Admin account cannot be added to a project");
        }

        // New rows for an already-existing project member must match that member's current
        // status, not silently default to ACTIVE — otherwise a disabled member re-invited with
        // an extra role ends up with per-role rows split across ACTIVE and DISABLED.
        List<ProjectUser> existingRows = projectUserRepository.findByProjectIdAndUserId(projectId, user.getId());
        ProjectUserStatus statusForNewRows = existingRows.isEmpty() || existingRows.stream().anyMatch(pu -> pu.getStatus() == ProjectUserStatus.ACTIVE)
            ? ProjectUserStatus.ACTIVE
            : ProjectUserStatus.DISABLED;
        for (Role role : roles) {
            if (projectUserRepository.findByProjectIdAndUserIdAndRoleId(projectId, user.getId(), role.getId()).isEmpty()) {
                ProjectUser projectUser = new ProjectUser(project, user, role);
                projectUser.setStatus(statusForNewRows);
                projectUserRepository.save(projectUser);
            }
        }

        notifyUserAdded(user, project, roles, isNewUser, tempPassword, authenticatedUserService.currentUser().getDisplayName());

        return ApiResponse.created("User added to project",
            summarizeOne(user, projectUserRepository.findByProjectIdAndUserId(projectId, user.getId())));
    }

    /** Best-effort — a mail outage shouldn't roll back the membership grant that already succeeded. */
    private void notifyUserAdded(User user, Project project, List<Role> roles, boolean isNewUser, String tempPassword, String invitedByName) {
        String roleNames = roles.stream().map(Role::getName).collect(Collectors.joining(", "));
        try {
            if (isNewUser) {
                mailService.sendProjectUserAdded(user.getEmail(), user.getUsername(), tempPassword,
                    project.getName(), project.getWorkspaceCode(), roleNames, invitedByName, frontendUrl);
            } else {
                mailService.sendProjectUserAttached(user.getEmail(), user.getUsername(),
                    project.getName(), project.getWorkspaceCode(), roleNames, invitedByName, frontendUrl);
            }
        } catch (RuntimeException ex) {
            log.warn("Failed to send project-onboarding email to {}", user.getEmail(), ex);
        }
    }

    @PutMapping("/{userId}")
    @Transactional
    public ApiResponse<ProjectUserDtos.ProjectUserSummary> update(@PathVariable Long projectId, @PathVariable Long userId,
                                                                   @Valid @RequestBody ProjectUserDtos.UpdateProjectUserRequest request) {
        requireProjectAccess(projectId);
        List<ProjectUser> rows = requireMembership(projectId, userId);
        User user = rows.get(0).getUser();
        user.setDisplayName(request.fullName().trim());
        if (request.mobileNumber() != null) user.setMobileNumber(request.mobileNumber().trim());
        if (request.designation() != null) user.setDesignation(request.designation().trim());
        if (request.organization() != null) user.setOrganization(request.organization().trim());
        userRepository.save(user);
        return ApiResponse.ok(summarizeOne(user, rows));
    }

    @PutMapping("/{userId}/status")
    @Transactional
    public ApiResponse<ProjectUserDtos.ProjectUserSummary> setStatus(@PathVariable Long projectId, @PathVariable Long userId,
                                                                      @Valid @RequestBody ProjectUserDtos.SetStatusRequest request) {
        requireProjectAccess(projectId);
        List<ProjectUser> rows = requireMembership(projectId, userId);
        if (request.status() == ProjectUserStatus.DISABLED) {
            guardLastProjectAdmin(projectId, rows);
        }
        rows.forEach(pu -> pu.setStatus(request.status()));
        projectUserRepository.saveAll(rows);
        return ApiResponse.ok(summarizeOne(rows.get(0).getUser(), rows));
    }

    @PutMapping("/{userId}/roles")
    @Transactional
    public ApiResponse<ProjectUserDtos.ProjectUserSummary> assignRoles(@PathVariable Long projectId, @PathVariable Long userId,
                                                                        @Valid @RequestBody ProjectUserDtos.AssignRolesRequest request) {
        requireProjectAccess(projectId);
        List<ProjectUser> rows = requireMembership(projectId, userId);
        List<Role> newRoles = resolveAssignableRoles(request.roleCodes());
        boolean keepsProjectAdmin = newRoles.stream().anyMatch(r -> r.getCode().equals("PROJECT_ADMIN"));
        if (!keepsProjectAdmin) {
            guardLastProjectAdmin(projectId, rows);
        }

        Project project = findProject(projectId);
        User user = rows.get(0).getUser();
        // rows has no guaranteed order, so don't pick an arbitrary row's status for newly
        // created role grants — derive it: ACTIVE if the member has any active role already.
        ProjectUserStatus currentStatus = rows.stream().anyMatch(pu -> pu.getStatus() == ProjectUserStatus.ACTIVE)
            ? ProjectUserStatus.ACTIVE
            : ProjectUserStatus.DISABLED;
        Set<Long> newRoleIds = newRoles.stream().map(Role::getId).collect(Collectors.toSet());
        rows.stream().filter(pu -> !newRoleIds.contains(pu.getRole().getId())).forEach(projectUserRepository::delete);
        for (Role role : newRoles) {
            if (rows.stream().noneMatch(pu -> pu.getRole().getId().equals(role.getId()))) {
                ProjectUser created = new ProjectUser(project, user, role);
                created.setStatus(currentStatus);
                projectUserRepository.save(created);
            }
        }
        return ApiResponse.ok(summarizeOne(user, projectUserRepository.findByProjectIdAndUserId(projectId, userId)));
    }

    /**
     * Atomic ownership handover (docs/version2.1.md "Project Administration Protection": never
     * transfer without assigning another Project Admin first). Grants the target PROJECT_ADMIN
     * (if they don't already hold it), then demotes the caller's own PROJECT_ADMIN grant — in
     * that order, within one transaction, so the project is never briefly left with zero admins.
     */
    @PostMapping("/{userId}/transfer-ownership")
    @Transactional
    public ApiResponse<ProjectUserDtos.ProjectUserSummary> transferOwnership(@PathVariable Long projectId, @PathVariable Long userId) {
        requireProjectAccess(projectId);
        List<ProjectUser> targetRows = requireMembership(projectId, userId);
        boolean targetActive = targetRows.stream().anyMatch(pu -> pu.getStatus() == ProjectUserStatus.ACTIVE);
        if (!targetActive) {
            throw new IllegalArgumentException("Only an active project member can become Project Admin");
        }

        // Reactivate an existing (possibly DISABLED) PROJECT_ADMIN row rather than inserting a
        // new one — uq_project_users(project_id, user_id, role_id) would reject a duplicate row,
        // and checking role presence alone (ignoring status) would otherwise let this method
        // return success while leaving no ACTIVE admin grant for the target at all.
        java.util.Optional<ProjectUser> existingAdminRow = targetRows.stream()
            .filter(pu -> pu.getRole().getCode().equals("PROJECT_ADMIN"))
            .findFirst();
        if (existingAdminRow.isPresent()) {
            if (existingAdminRow.get().getStatus() != ProjectUserStatus.ACTIVE) {
                existingAdminRow.get().setStatus(ProjectUserStatus.ACTIVE);
                projectUserRepository.save(existingAdminRow.get());
            }
        } else {
            Project project = findProject(projectId);
            Role projectAdminRole = roleRepository.findByCode("PROJECT_ADMIN")
                .orElseThrow(() -> new IllegalStateException("Role catalog is missing PROJECT_ADMIN"));
            ProjectUser grant = new ProjectUser(project, targetRows.get(0).getUser(), projectAdminRole);
            grant.setStatus(ProjectUserStatus.ACTIVE);
            projectUserRepository.save(grant);
        }

        // Demote the caller's own grant — unless they're transferring to themselves (no-op; would
        // otherwise demote the very row we just confirmed as the target's admin grant) or the
        // caller is Super Admin using this as a support override (no project_users row of their
        // own to demote).
        User current = authenticatedUserService.currentUser();
        if (!current.getId().equals(userId) && current.getRole() != UserRole.SUPER_ADMIN) {
            List<ProjectUser> callerRows = projectUserRepository.findByProjectIdAndUserId(projectId, current.getId());
            List<ProjectUser> callerAdminRows = callerRows.stream()
                .filter(pu -> pu.getRole().getCode().equals("PROJECT_ADMIN"))
                .toList();
            if (callerRows.size() > callerAdminRows.size()) {
                // Caller holds other roles too — dropping the admin grant still leaves them a
                // project member.
                callerAdminRows.forEach(projectUserRepository::delete);
            } else if (!callerAdminRows.isEmpty()) {
                // PROJECT_ADMIN was the caller's only role — demote to Viewer instead of deleting
                // their last row, which would eject them from the project entirely.
                Role viewerRole = roleRepository.findByCode("VIEWER")
                    .orElseThrow(() -> new IllegalStateException("Role catalog is missing VIEWER"));
                Project project = findProject(projectId);
                callerAdminRows.forEach(projectUserRepository::delete);
                projectUserRepository.save(new ProjectUser(project, current, viewerRole));
            }
        }

        return ApiResponse.ok(summarizeOne(targetRows.get(0).getUser(), projectUserRepository.findByProjectIdAndUserId(projectId, userId)));
    }

    @DeleteMapping("/{userId}")
    @Transactional
    public ApiResponse<Void> remove(@PathVariable Long projectId, @PathVariable Long userId) {
        requireProjectAccess(projectId);
        List<ProjectUser> rows = requireMembership(projectId, userId);
        User current = authenticatedUserService.currentUser();
        boolean isActiveAdmin = rows.stream()
            .anyMatch(pu -> pu.getRole().getCode().equals("PROJECT_ADMIN") && pu.getStatus() == ProjectUserStatus.ACTIVE);
        if (current.getId().equals(userId) && isActiveAdmin) {
            throw new IllegalArgumentException("You can't remove yourself while you're this project's Project Admin — transfer ownership to another member first");
        }
        guardLastProjectAdmin(projectId, rows);
        projectUserRepository.deleteAll(rows);
        return ApiResponse.ok(null);
    }

    // ── helpers ──────────────────────────────────────────────────────────────


    private void requireProjectAccess(Long projectId) {
        User current = authenticatedUserService.currentUser();
        if (current.getRole() == UserRole.SUPER_ADMIN) return;
        boolean isActiveAdminHere = projectUserRepository.findByProjectIdAndUserId(projectId, current.getId()).stream()
            .anyMatch(pu -> pu.getStatus() == ProjectUserStatus.ACTIVE && pu.getRole().getCode().equals("PROJECT_ADMIN"));
        if (!isActiveAdminHere) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only this project's Project Admin can manage its users");
        }
    }

    private Project findProject(Long projectId) {
        return projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
    }

    private List<ProjectUser> requireMembership(Long projectId, Long userId) {
        List<ProjectUser> rows = projectUserRepository.findByProjectIdAndUserId(projectId, userId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "That user is not a member of this project");
        }
        return rows;
    }

    private List<Role> resolveAssignableRoles(List<String> codes) {
        return codes.stream().distinct().map(code -> {
            String normalized = code.trim().toUpperCase();
            if (!ASSIGNABLE_ROLE_CODES.contains(normalized)) {
                throw new IllegalArgumentException("'" + code + "' is not a project-assignable role");
            }
            return roleRepository.findByCode(normalized)
                .orElseThrow(() -> new IllegalStateException("Role catalog is missing " + normalized));
        }).toList();
    }

    private void guardLastProjectAdmin(Long projectId, List<ProjectUser> targetRows) {
        boolean targetIsActiveAdmin = targetRows.stream()
            .anyMatch(pu -> pu.getRole().getCode().equals("PROJECT_ADMIN") && pu.getStatus() == ProjectUserStatus.ACTIVE);
        if (!targetIsActiveAdmin) return;
        long activeAdmins = projectUserRepository.countByProjectIdAndRoleCodeAndStatus(projectId, "PROJECT_ADMIN", ProjectUserStatus.ACTIVE);
        if (activeAdmins <= 1) {
            throw new IllegalArgumentException("This project must always have at least one active Project Admin");
        }
    }

    private List<ProjectUserDtos.ProjectUserSummary> summarize(List<ProjectUser> rows) {
        Map<Long, List<ProjectUser>> byUser = rows.stream().collect(Collectors.groupingBy(pu -> pu.getUser().getId()));
        return byUser.values().stream()
            .map(group -> summarizeOne(group.get(0).getUser(), group))
            .sorted(Comparator.comparing(ProjectUserDtos.ProjectUserSummary::username))
            .toList();
    }

    private ProjectUserDtos.ProjectUserSummary summarizeOne(User user, List<ProjectUser> rows) {
        List<String> roles = rows.stream().map(pu -> pu.getRole().getCode()).distinct().toList();
        ProjectUserStatus status = rows.stream().anyMatch(pu -> pu.getStatus() == ProjectUserStatus.ACTIVE)
            ? ProjectUserStatus.ACTIVE : ProjectUserStatus.DISABLED;
        Instant joinedAt = rows.stream().map(ProjectUser::getCreatedAt).filter(Objects::nonNull)
            .min(Instant::compareTo).orElse(null);
        return new ProjectUserDtos.ProjectUserSummary(
            user.getId(), user.getUsername(), user.getEmail(), user.getDisplayName(),
            user.getMobileNumber(), roles, status, joinedAt
        );
    }
}
