package com.testrix.platform.workspace;

import com.testrix.platform.mail.MailService;
import com.testrix.platform.common.EntityIdGeneratorService;
import com.testrix.platform.common.TempPasswordGenerator;
import com.testrix.platform.users.Role;
import com.testrix.platform.users.RoleRepository;
import com.testrix.platform.users.User;
import com.testrix.platform.users.UserRepository;
import com.testrix.platform.users.UserRole;
import com.testrix.platform.users.UserStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Turns an approved {@link WorkspaceRequest} into a real Tenant-scoped {@link Project}: creates
 * the project + its requested modules + a Project Admin user account + the project_users grant
 * that ties them together. Single default tenant for Phase 1 (docs/version2.1.md requirement #3);
 * every project created here belongs to it.
 */
@Service
public class WorkspaceProvisioningService {
    private static final String DEFAULT_TENANT_CODE = "TEN-000001";

    private final WorkspaceRequestRepository workspaceRequestRepository;
    private final TenantRepository tenantRepository;
    private final ProjectRepository projectRepository;
    private final ProjectModuleRepository projectModuleRepository;
    private final ProjectUserRepository projectUserRepository;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final EntityIdGeneratorService entityIdGeneratorService;
    private final MailService mailService;
    private final String frontendUrl;

    public WorkspaceProvisioningService(WorkspaceRequestRepository workspaceRequestRepository,
                                        TenantRepository tenantRepository,
                                        ProjectRepository projectRepository,
                                        ProjectModuleRepository projectModuleRepository,
                                        ProjectUserRepository projectUserRepository,
                                        UserRepository userRepository,
                                        RoleRepository roleRepository,
                                        PasswordEncoder passwordEncoder,
                                        EntityIdGeneratorService entityIdGeneratorService,
                                        MailService mailService,
                                        @Value("${portal.app.frontend-url}") String frontendUrl) {
        this.workspaceRequestRepository = workspaceRequestRepository;
        this.tenantRepository = tenantRepository;
        this.projectRepository = projectRepository;
        this.projectModuleRepository = projectModuleRepository;
        this.projectUserRepository = projectUserRepository;
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.entityIdGeneratorService = entityIdGeneratorService;
        this.mailService = mailService;
        this.frontendUrl = frontendUrl;
    }

    @Transactional
    public WorkspaceRequestDtos.ApprovalResult approve(WorkspaceRequest request, User reviewer) {
        if (request.getStatus() != WorkspaceRequestStatus.PENDING) {
            throw new IllegalArgumentException("This request has already been reviewed");
        }
        if (projectRepository.existsByNameIgnoreCase(request.getProjectName())) {
            throw new IllegalArgumentException("A project named '" + request.getProjectName() + "' already exists");
        }
        if (projectRepository.existsByPreferredWorkspaceSlugIgnoreCase(request.getPreferredWorkspaceSlug())) {
            throw new IllegalArgumentException("Workspace code '" + request.getPreferredWorkspaceSlug() + "' is already in use");
        }
        if (workspaceRequestRepository.existsByWorkspaceNameIgnoreCaseAndStatusIn(request.getWorkspaceName(),
                java.util.List.of(WorkspaceRequestStatus.APPROVED))) {
            throw new IllegalArgumentException("Workspace name '" + request.getWorkspaceName() + "' is already in use");
        }
        // Removed check to allow reusing an existing user account for multiple workspaces

        Tenant tenant = tenantRepository.findByTenantCode(DEFAULT_TENANT_CODE)
            .orElseThrow(() -> new IllegalStateException("Default tenant is missing — data migration V21 did not run"));

        Project project = new Project(
            tenant,
            entityIdGeneratorService.next("PRJ"),
            entityIdGeneratorService.next("WS"),
            request.getPreferredWorkspaceSlug(),
            request.getProjectName()
        );
        project.setDescription(request.getProjectDescription());
        project.setBackendTech(request.getBackendTech());
        project.setFrontendTech(request.getFrontendTech());
        project.setDatabaseTech(request.getDatabaseTech());
        project.setCicdTool(request.getCicdTool());
        projectRepository.save(project);

        String modulesCsv = request.getRequestedModules() == null ? "" : request.getRequestedModules();
        for (String moduleType : modulesCsv.split(",")) {
            if (moduleType.isBlank()) continue;
            projectModuleRepository.save(new ProjectModule(project, ProjectModuleType.valueOf(moduleType.trim()), true));
        }

        boolean userExists = userRepository.existsByEmail(request.getEmail());
        User projectAdmin;
        String username;
        String tempPassword = null;
        if (userExists) {
            projectAdmin = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalStateException("User not found for email: " + request.getEmail()));
            username = projectAdmin.getUsername();
        } else {
            username = uniqueUsername(request.getEmail());
            tempPassword = TempPasswordGenerator.generate();
            projectAdmin = new User();
            projectAdmin.setUsername(username);
            projectAdmin.setEmail(request.getEmail());
            projectAdmin.setPasswordHash(passwordEncoder.encode(tempPassword));
            projectAdmin.setDisplayName(request.getProjectManagerName());
            projectAdmin.setMobileNumber(request.getPhone());
            projectAdmin.setRole(UserRole.VIEWER); // platform-level flag only; real authority is the PROJECT_ADMIN project_users grant below
            projectAdmin.setStatus(UserStatus.ACTIVE);
            projectAdmin.setEmailVerified(true);
            projectAdmin.setAuthProvider("LOCAL");
            projectAdmin.setBusinessId(entityIdGeneratorService.next("USR"));
            userRepository.save(projectAdmin);
        }

        Role projectAdminRole = roleRepository.findByCode("PROJECT_ADMIN")
            .orElseThrow(() -> new IllegalStateException("PROJECT_ADMIN role is missing — data migration V21 did not run"));
        projectUserRepository.save(new ProjectUser(project, projectAdmin, projectAdminRole));

        request.setStatus(WorkspaceRequestStatus.APPROVED);
        request.setReviewedBy(reviewer);
        request.setReviewedAt(Instant.now());
        request.setResultingProject(project);
        workspaceRequestRepository.save(request);

        boolean emailSent = true;
        try {
            if (userExists) {
                mailService.sendProjectUserAttached(
                    projectAdmin.getEmail(),
                    username,
                    project.getName(),
                    project.getWorkspaceCode(),
                    projectAdminRole.getName(),
                    reviewer.getDisplayName(),
                    frontendUrl
                );
            } else {
                mailService.sendWorkspaceApproved(
                    projectAdmin.getEmail(),
                    project.getName(),
                    project.getWorkspaceCode(),
                    username,
                    tempPassword,
                    frontendUrl
                );
            }
        } catch (RuntimeException ex) {
            emailSent = false;
        }

        return new WorkspaceRequestDtos.ApprovalResult(
            project.getProjectCode(), project.getWorkspaceCode(), project.getName(),
            username, tempPassword, emailSent
        );
    }

    @Transactional
    public void reject(WorkspaceRequest request, User reviewer, String reason) {
        if (request.getStatus() != WorkspaceRequestStatus.PENDING) {
            throw new IllegalArgumentException("This request has already been reviewed");
        }
        request.setStatus(WorkspaceRequestStatus.REJECTED);
        request.setRejectionReason(reason);
        request.setReviewedBy(reviewer);
        request.setReviewedAt(Instant.now());
        workspaceRequestRepository.save(request);
    }

    private String uniqueUsername(String email) {
        String base = email.substring(0, email.indexOf('@')).replaceAll("[^A-Za-z0-9_]", "");
        if (base.isBlank()) base = "user";
        String candidate = base;
        while (userRepository.existsByUsername(candidate)) {
            candidate = base + "_" + UUID.randomUUID().toString().substring(0, 6);
        }
        return candidate;
    }
}
