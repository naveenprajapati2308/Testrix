package com.automationportal.config;

import com.automationportal.environments.EnvironmentEntity;
import com.automationportal.environments.EnvironmentRepository;
import com.automationportal.modules.ModuleSyncService;
import com.automationportal.security.CurrentProjectService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
public class AutomationDataSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(AutomationDataSeeder.class);

    private final ModuleSyncService moduleSyncService;
    private final EnvironmentRepository environmentRepository;
    private final CurrentProjectService currentProjectService;

    public AutomationDataSeeder(ModuleSyncService moduleSyncService,
                                EnvironmentRepository environmentRepository,
                                CurrentProjectService currentProjectService) {
        this.moduleSyncService = moduleSyncService;
        this.environmentRepository = environmentRepository;
        this.currentProjectService = currentProjectService;
    }

    @Override
    public void run(String... args) {
        Long defaultProjectId;
        try {
            defaultProjectId = currentProjectService.defaultWorkspaceProjectId();
        } catch (RuntimeException ex) {
            // The projects table is owned by the platform service. Booting before it has ever
            // provisioned the default workspace must not take this product down — every other
            // automation feature works without these baseline rows.
            log.warn("Skipping automation baseline seeding: {}", ex.getMessage());
            return;
        }

        // Only QA/UAT ship as defaults — further environments are added from the
        // Environments page (owner's call, 2026-07-05).
        seedEnvironment(defaultProjectId, "QA", "QA");
        seedEnvironment(defaultProjectId, "UAT", "UAT");

        moduleSyncService.upsert("LAND",          "Land Management",       "land-v2.xml",          "reports/Land_Management_Suite.html", "MAVEN_TESTNG");
        moduleSyncService.upsert("EMP_ARCH",      "Architect Empanelment", "Emp_Arch-v2.xml",      "reports/Architect_Empanelment_Suite.html", "MAVEN_TESTNG");
        moduleSyncService.upsert("ARCH_WORKFLOW", "Architect Workflow",    "Arch_workflow-v2.xml", "reports/Architect_workflow_Suite.html", "MAVEN_TESTNG");

        // A new "ARCHITECT" code rather than reusing Selenium's EMP_ARCH/ARCH_WORKFLOW: Playwright's
        // single "architect" spec folder maps loosely to both, and forcing it onto either would
        // misrepresent coverage.
        moduleSyncService.upsert("LAND",     "Land Management",       "tests/specs/mphidb/land",      null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT", "Architect Empanelment", "tests/specs/mphidb/architect", null, "PLAYWRIGHT");

        // One spec file each (not the folder) so a single registration type can be run on its own.
        // Each spec owns its literal @smoke/@regression test() titles because framework-runner's
        // handleTags() regex-scans exactly the file xmlFile points at — tags living only in the
        // shared helper made these modules report zero tags.
        moduleSyncService.upsert("ARCHITECT_INDIVIDUAL",     "Architect Empanelment - Individual",     "tests/specs/mphidb/architect/individual-empanelment.spec.ts",     null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_PROPRIETORSHIP", "Architect Empanelment - Proprietorship", "tests/specs/mphidb/architect/proprietorship-empanelment.spec.ts", null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_PARTNERSHIP",    "Architect Empanelment - Partnership",    "tests/specs/mphidb/architect/partnership-empanelment.spec.ts",    null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_PVTLTD",         "Architect Empanelment - Pvt Ltd",         "tests/specs/mphidb/architect/pvt-ltd-empanelment.spec.ts",        null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_PUBLICLTD",      "Architect Empanelment - Public Ltd",      "tests/specs/mphidb/architect/public-ltd-empanelment.spec.ts",     null, "PLAYWRIGHT");
        moduleSyncService.upsert("ARCHITECT_LLP",            "Architect Empanelment - LLP",             "tests/specs/mphidb/architect/llp-empanelment.spec.ts",            null, "PLAYWRIGHT");
    }

    // Must stay project-scoped: since V32 made environments.code unique per-project rather than
    // globally, a plain findByCode matches every project's same-named row and throws the moment a
    // second project also has a "UAT" — this crashed the app on every boot.
    private void seedEnvironment(Long projectId, String code, String name) {
        if (environmentRepository.findByProjectIdAndCode(projectId, code).isEmpty()) {
            EnvironmentEntity env = new EnvironmentEntity(code, name);
            env.setProjectId(projectId);
            environmentRepository.save(env);
        }
    }
}
