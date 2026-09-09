package com.automationportal.config;

import com.automationportal.environments.EnvironmentEntity;
import com.automationportal.environments.EnvironmentRepository;
import com.automationportal.modules.ModuleSyncService;
import com.automationportal.users.*;
import com.automationportal.workspace.CurrentProjectService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);
    private final UserRepository userRepository;
    private final ModuleSyncService moduleSyncService;
    private final EnvironmentRepository environmentRepository;
    private final CurrentProjectService currentProjectService;
    private final PasswordEncoder passwordEncoder;
    private final String superAdminSeedPassword;
    private final String superAdminEmail;

    public DataSeeder(UserRepository userRepository, ModuleSyncService moduleSyncService,
                      EnvironmentRepository environmentRepository, CurrentProjectService currentProjectService,
                      PasswordEncoder passwordEncoder,
                      @Value("${portal.superadmin.seed-password}") String superAdminSeedPassword,
                      @Value("${portal.superadmin.email}") String superAdminEmail) {
        this.userRepository = userRepository;
        this.moduleSyncService = moduleSyncService;
        this.environmentRepository = environmentRepository;
        this.currentProjectService = currentProjectService;
        this.passwordEncoder = passwordEncoder;
        this.superAdminSeedPassword = superAdminSeedPassword;
        this.superAdminEmail = superAdminEmail;
    }

    @Override
    public void run(String... args) {
        // The one Super Admin identity, platform-wide (PORTAL_SUPERADMIN_EMAIL — never a
        // hardcoded literal). The existing SUPER_ADMIN role holder (if any) is always preferred
        // over an email/username match, so this reconciles that account's email on restart
        // without ever re-deriving "who is super admin" from an email match alone — an
        // unrelated user whose email happens to collide with a misconfigured
        // PORTAL_SUPERADMIN_EMAIL must never be silently promoted while a real SUPER_ADMIN
        // already exists.
        java.util.Optional<User> existingRoleHolder = userRepository.findAll().stream()
                .filter(u -> u.getRole() == UserRole.SUPER_ADMIN).findFirst();
        java.util.Optional<User> existing = existingRoleHolder
                .or(() -> userRepository.findByUsernameOrEmail(superAdminEmail, superAdminEmail));

        if (existing.isPresent() && existingRoleHolder.isEmpty() && existing.get().getRole() != UserRole.SUPER_ADMIN) {
            log.warn("Promoting existing user (id={}, username={}) to SUPER_ADMIN because it matches " +
                            "PORTAL_SUPERADMIN_EMAIL and no SUPER_ADMIN account currently exists. " +
                            "Verify this is the intended account.",
                    existing.get().getId(), existing.get().getUsername());
        }

        if (existing.isEmpty()) {
            User superAdmin = new User();
            superAdmin.setUsername(superAdminEmail);
            superAdmin.setEmail(superAdminEmail);
            superAdmin.setDisplayName("Super Admin");
            superAdmin.setRole(UserRole.SUPER_ADMIN);
            superAdmin.setStatus(UserStatus.ACTIVE);
            superAdmin.setEmailVerified(true);
            superAdmin.setAuthProvider("LOCAL");
            // Only applied on first-ever creation — an existing account's password is never
            // touched by this seeder, so this doesn't reset anything on restart.
            superAdmin.setPasswordHash(passwordEncoder.encode(superAdminSeedPassword));
            userRepository.save(superAdmin);
        } else {
            existing.ifPresent(superAdmin -> {
                boolean changed = false;
                if (!superAdminEmail.equals(superAdmin.getUsername())) {
                    superAdmin.setUsername(superAdminEmail);
                    changed = true;
                }
                if (!superAdminEmail.equals(superAdmin.getEmail())) {
                    superAdmin.setEmail(superAdminEmail);
                    changed = true;
                }
                if (superAdmin.getRole() != UserRole.SUPER_ADMIN) {
                    superAdmin.setRole(UserRole.SUPER_ADMIN);
                    changed = true;
                }
                if (!superAdmin.isEmailVerified() || superAdmin.getStatus() != UserStatus.ACTIVE) {
                    superAdmin.setEmailVerified(true);
                    superAdmin.setStatus(UserStatus.ACTIVE);
                    changed = true;
                }
                if (changed) userRepository.save(superAdmin);
            });
        }

        // Only QA/UAT ship as defaults — further environments are added from the
        // Environments page (owner's call, 2026-07-05).
        seedEnvironment("QA", "QA");
        seedEnvironment("UAT", "UAT");

        moduleSyncService.upsert("LAND",          "Land Management",       "land-v2.xml",          "reports/Land_Management_Suite.html", "MAVEN_TESTNG");
        moduleSyncService.upsert("EMP_ARCH",      "Architect Empanelment", "Emp_Arch-v2.xml",      "reports/Architect_Empanelment_Suite.html", "MAVEN_TESTNG");
        moduleSyncService.upsert("ARCH_WORKFLOW", "Architect Workflow",    "Arch_workflow-v2.xml", "reports/Architect_workflow_Suite.html", "MAVEN_TESTNG");

        // Playwright's own module folders (tests/specs/mphidb/<land|architect>/*.spec.ts) —
        // a new "ARCHITECT" code rather than reusing Selenium's EMP_ARCH/ARCH_WORKFLOW, since
        // Playwright's single "architect" spec folder maps loosely to both and forcing it onto
        // either would misrepresent coverage.
        moduleSyncService.upsert("LAND",     "Land Management",       "tests/specs/mphidb/land",      null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT", "Architect Empanelment", "tests/specs/mphidb/architect", null, "PLAYWRIGHT");

        // Per-type Architect Empanelment modules (2026-07-31): each points at its own single
        // spec file (not the whole folder) so a user can pick exactly one registration type from
        // the Execution Center, same as "ARCHITECT" above does for all 6 at once. Each of these
        // spec files now owns its own literal test() titles carrying @smoke/@regression (see
        // empanelment-flow-helpers.ts's runSmokeFlow/runRegressionFlow split) specifically so
        // framework-runner's handleTags() - which regex-scans the exact file a module's xmlFile
        // points at - finds those tags. Before this, the tagged test() calls lived only in the
        // shared helper file, so a module scoped to one type's spec would report zero tags.
        moduleSyncService.upsert("ARCHITECT_INDIVIDUAL",     "Architect Empanelment - Individual",     "tests/specs/mphidb/architect/individual-empanelment.spec.ts",     null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_PROPRIETORSHIP", "Architect Empanelment - Proprietorship", "tests/specs/mphidb/architect/proprietorship-empanelment.spec.ts", null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_PARTNERSHIP",    "Architect Empanelment - Partnership",    "tests/specs/mphidb/architect/partnership-empanelment.spec.ts",    null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_PVTLTD",         "Architect Empanelment - Pvt Ltd",         "tests/specs/mphidb/architect/pvt-ltd-empanelment.spec.ts",        null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_PUBLICLTD",      "Architect Empanelment - Public Ltd",      "tests/specs/mphidb/architect/public-ltd-empanelment.spec.ts",     null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_LLP",            "Architect Empanelment - LLP",             "tests/specs/mphidb/architect/llp-empanelment.spec.ts",            null, "PLAYWRIGHT");
    }

    // Scoped to the Default Workspace specifically — these are its own baseline QA/UAT rows,
    // not a platform-wide default. Since V32 (environments.code unique per-project, not
    // globally), a plain findByCode would now match every project's same-named environment and
    // throw (Optional/getSingleResult expects exactly one) the moment a second project also has
    // a "UAT" — this crashed the app on every boot until scoped by project_id here.
    private void seedEnvironment(String code, String name) {
        Long defaultProjectId = currentProjectService.defaultWorkspaceProjectId();
        if (environmentRepository.findByProjectIdAndCode(defaultProjectId, code).isEmpty()) {
            EnvironmentEntity env = new EnvironmentEntity(code, name);
            env.setProjectId(defaultProjectId);
            environmentRepository.save(env);
        }
    }
}
