package com.automationportal.executions;

import com.automationportal.config.PortalAutomationProperties;
import com.automationportal.environments.EnvironmentEntity;
import com.automationportal.environments.EnvironmentRepository;
import com.automationportal.moduleenvironments.ModuleEnvironmentEntity;
import com.automationportal.moduleenvironments.ModuleEnvironmentRepository;
import com.automationportal.moduleenvironments.ModuleEnvironmentResolver;
import com.automationportal.modules.ModuleEntity;
import com.automationportal.modules.ModuleRepository;
import com.automationportal.testengine.EngineStatus;
import com.automationportal.testengine.TestEngine;
import com.automationportal.testengine.TestEngineRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class ExecutionWorker {
    private static final Logger log = LoggerFactory.getLogger(ExecutionWorker.class);

    private final ExecutionRepository executionRepository;
    private final ExecutionArtifactRepository artifactRepository;
    private final ExecutionLogRepository logRepository;
    private final PortalAutomationProperties properties;
    private final ModuleRepository moduleRepository;
    private final ExecutionTestCaseRepository testCaseRepository;
    private final TestStepRepository testStepRepository;
    private final TagRepository tagRepository;
    private final TestNGXmlParser testNGXmlParser;
    private final EnvironmentRepository environmentRepository;
    private final ModuleEnvironmentRepository moduleEnvironmentRepository;
    private final TestEngineRepository testEngineRepository;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${portal.execution-manager.url:http://localhost:8090}")
    private String executionManagerUrl;

    public ExecutionWorker(ExecutionRepository executionRepository,
                           ExecutionArtifactRepository artifactRepository,
                           ExecutionLogRepository logRepository,
                           PortalAutomationProperties properties,
                           ModuleRepository moduleRepository,
                           ExecutionTestCaseRepository testCaseRepository,
                           TestStepRepository testStepRepository,
                           TagRepository tagRepository,
                           TestNGXmlParser testNGXmlParser,
                           EnvironmentRepository environmentRepository,
                           ModuleEnvironmentRepository moduleEnvironmentRepository,
                           TestEngineRepository testEngineRepository) {
        this.executionRepository = executionRepository;
        this.artifactRepository = artifactRepository;
        this.logRepository = logRepository;
        this.properties = properties;
        this.moduleRepository = moduleRepository;
        this.testCaseRepository = testCaseRepository;
        this.testStepRepository = testStepRepository;
        this.tagRepository = tagRepository;
        this.testNGXmlParser = testNGXmlParser;
        this.environmentRepository = environmentRepository;
        this.moduleEnvironmentRepository = moduleEnvironmentRepository;
        this.testEngineRepository = testEngineRepository;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    @Scheduled(fixedDelay = 5000)
    public void pollQueue() {
        List<Execution> queuedList = executionRepository.findByStatus(ExecutionStatus.QUEUED);
        if (queuedList.isEmpty()) {
            return;
        }

        // Keyed per framework directory, not platform-wide. A blanket "any execution is RUNNING"
        // gate here blocked every project behind whichever one happened to be running, before
        // anything even reached the Execution Manager's own project-aware queue. Runs sharing a
        // directory still serialize; different projects no longer do.
        Set<String> busyKeys = executionRepository.findByStatus(ExecutionStatus.RUNNING).stream()
                .map(this::resolveDispatchKey)
                .collect(Collectors.toSet());

        // Oldest-first, same as before; submit the first queued execution whose key isn't
        // already busy — one submission per tick, same cadence as before, just no longer
        // blocked by an unrelated project's run.
        for (Execution execution : queuedList) {
            if (!busyKeys.contains(resolveDispatchKey(execution))) {
                processExecution(execution);
                return;
            }
        }
    }

    /** Mirrors processExecution()'s resolution but side-effect free — this only needs a stable
     *  identity for the concurrency guard above: the engine's frameworkPath when one is linked,
     *  else the shared checkout identity for legacy modules. */
    private String resolveDispatchKey(Execution execution) {
        if (execution.getExecutionType() == ExecutionType.MODULE && execution.getModuleCode() != null) {
            Optional<ModuleEntity> moduleOpt = moduleRepository
                    .findByCodeAndRunnerType(execution.getModuleCode().toUpperCase(), execution.getFramework());
            if (moduleOpt.isPresent() && moduleOpt.get().getTestEngineId() != null) {
                TestEngine engine = testEngineRepository.findById(moduleOpt.get().getTestEngineId()).orElse(null);
                if (engine != null && engine.getFrameworkPath() != null && !engine.getFrameworkPath().isBlank()) {
                    return engine.getFrameworkPath();
                }
            }
        }
        String framework = execution.getFramework();
        return "LEGACY_SHARED_" + (framework == null ? "" : framework.toUpperCase());
    }

    public void cancelExecution(Long id) {
        Execution execution = executionRepository.findById(id).orElse(null);
        if (execution == null) return;

        log.info("Requesting cancellation of execution {} from Execution Manager", id);
        try {
            String jobId = execution.getExecutionCode();
            String url = executionManagerUrl + "/em/executions/" + jobId + "/cancel";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .timeout(Duration.ofSeconds(5))
                    .build();

            httpClient.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                    .thenAccept(res -> log.info("Cancel request sent to Execution Manager. Status: {}", res.statusCode()));

            execution.setStatus(ExecutionStatus.CANCELLED);
            execution.setEndTime(Instant.now());
            executionRepository.save(execution);
            logToDb(id, "INFO", "Execution was cancelled and termination requested from Execution Manager", "SYSTEM");
        } catch (Exception e) {
            log.error("Failed to call Execution Manager cancel API for execution: {}", id, e);
        }
    }

    private void processExecution(Execution execution) {
        Long execId = execution.getId();

        // 1. Resolve suite XML and name
        String xmlFileName = "MPHIDB.xml";
        String suiteName = "Master Automation Suite";
        String suiteReport = "reports/MasterReport2.html";
        // Set for MODULE-type executions only; ALL_MODULES/XML_SUITE have no single module in
        // play, so resolveEnvConfigJson()/timeout resolution fall back to environment-only.
        ModuleEntity resolvedModule = null;

        if (execution.getExecutionType() == ExecutionType.ALL_MODULES) {
            PortalAutomationProperties.SuiteInfo suite = properties.getSuites().get("all");
            if (suite != null) {
                xmlFileName = suite.getXml();
                suiteName = suite.getName();
                suiteReport = suite.getReport() != null ? suite.getReport() : suiteReport;
            }
        } else if (execution.getExecutionType() == ExecutionType.MODULE) {
            String mod = execution.getModuleCode();
            // Primary: look up module in DB by code, scoped to this execution's framework —
            // the same business module can exist once per framework (e.g. "LAND" under both
            // MAVEN_TESTNG and PLAYWRIGHT) since V14's composite unique key.
            java.util.Optional<ModuleEntity> moduleOpt = mod != null
                    ? moduleRepository.findByCodeAndRunnerType(mod.toUpperCase(), execution.getFramework())
                    : java.util.Optional.empty();
            resolvedModule = moduleOpt.orElse(null);
            if (moduleOpt.isPresent() && moduleOpt.get().getXmlFile() != null) {
                ModuleEntity m = moduleOpt.get();
                xmlFileName = m.getXmlFile();
                suiteName = m.getName() + " Suite";
                if (m.getReportPath() != null) suiteReport = m.getReportPath();
            } else {
                // Fallback: application.yml suites map
                String suiteKey = mod != null ? mod.toLowerCase() : "";
                PortalAutomationProperties.SuiteInfo suite = properties.getSuites().get(suiteKey);
                if (suite != null) {
                    xmlFileName = suite.getXml();
                    suiteName = suite.getName();
                    if (suite.getReport() != null) suiteReport = suite.getReport();
                }
            }
        } else if (execution.getExecutionType() == ExecutionType.XML_SUITE) {
            xmlFileName = execution.getSuiteXmlPath();
            suiteName = "Custom XML Suite: " + xmlFileName;
            suiteReport = resolveReportPathForXml(xmlFileName);
        }

        execution.setSuiteName(suiteName);
        execution.setSuiteXmlPath(xmlFileName);

        // docs/version2.3.md Plan 2 §10 "Check Engine Status": resolve the module's registered
        // Test Engine (if any) before dispatch. A DISABLED engine synchronously blocks the run
        // rather than letting it queue on Execution Manager and fail opaquely later.
        TestEngine engine = null;
        if (resolvedModule != null && resolvedModule.getTestEngineId() != null) {
            engine = testEngineRepository.findById(resolvedModule.getTestEngineId()).orElse(null);
            if (engine != null && engine.getStatus() == EngineStatus.DISABLED) {
                execution.setStatus(ExecutionStatus.ERROR);
                execution.setEndTime(Instant.now());
                executionRepository.save(execution);
                logToDb(execId, "ERROR", "Test Engine '" + engine.getName() + "' (" + engine.getBusinessId()
                        + ") is disabled; execution rejected before dispatch.", "SYSTEM");
                return;
            }
            execution.setTestEngineId(engine != null ? engine.getId() : null);
        }

        // Submit to Execution Manager enqueuing
        log.info("Submitting execution {} to Execution Manager...", execution.getExecutionCode());
        try {
            String url = executionManagerUrl + "/em/executions";
            String envConfigJson = resolveEnvConfigJson(execution.getEnvironmentId(), resolvedModule);
            int timeoutMinutes = resolveTimeoutMinutes(execution.getEnvironmentId(), resolvedModule);
            String framework = execution.getFramework() != null && !execution.getFramework().isBlank()
                    ? execution.getFramework() : "MAVEN_TESTNG";
            String browser = execution.getRequestedBrowser() != null ? execution.getRequestedBrowser() : "";
            // engine != null -> tells Execution Manager to withhold its static global credential
            // at dispatch time (docs/test-engine-integration-architecture.md §3.5) — the engine's
            // own environment already holds its own key from the one-time registration handoff.
            String testEngineCode = engine != null ? engine.getBusinessId() : null;
            // Threads test_engines.framework_path through so this job runs against the engine's
            // own project-specific framework directory (under PROJECT_FRAMEWORKS_ROOT) instead of
            // the one static, shared checkout — null/blank preserves today's legacy behavior.
            String frameworkPath = engine != null ? engine.getFrameworkPath() : null;
            // Map request payload matching EM ExecutionJob entity
            String jsonPayload = String.format(
                    "{\"jobId\":\"%s\",\"executionId\":%d,\"suiteXml\":\"%s\",\"framework\":\"%s\",\"browser\":\"%s\",\"priority\":\"MEDIUM\",\"maxRetries\":0,\"timeoutMinutes\":%d,\"submittedBy\":\"admin\",\"envConfigJson\":%s,\"tagFilter\":%s,\"testEngineCode\":%s,\"frameworkPath\":%s}",
                    execution.getExecutionCode(), execution.getId(), xmlFileName, framework, browser, timeoutMinutes,
                    objectMapper.writeValueAsString(envConfigJson), objectMapper.writeValueAsString(execution.getTagFilter()),
                    objectMapper.writeValueAsString(testEngineCode), objectMapper.writeValueAsString(frameworkPath)
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 || response.statusCode() == 202) {
                // Change status to RUNNING to block local poll queue from picking it up again
                execution.setStatus(ExecutionStatus.RUNNING);
                execution.setStartTime(Instant.now());
                executionRepository.save(execution);

                logToDb(execId, "INFO", "Successfully submitted execution to Execution Manager. Awaiting callback...", "SYSTEM");
            } else {
                log.error("Execution Manager rejected execution submission: {} - {}", response.statusCode(), response.body());
                execution.setStatus(ExecutionStatus.ERROR);
                executionRepository.save(execution);
                logToDb(execId, "ERROR", "Failed to submit execution to Execution Manager. Code: " + response.statusCode(), "SYSTEM");
            }
        } catch (Exception e) {
            log.error("Exception submitting execution to Execution Manager", e);
            execution.setStatus(ExecutionStatus.ERROR);
            executionRepository.save(execution);
            logToDb(execId, "ERROR", "Exception calling Execution Manager: " + e.getMessage(), "SYSTEM");
        }
    }

    /** Flattens the effective run config for the runner, which injects each entry as a Maven -D
     *  property (or process env for Playwright). Later wins: environment base -> module override
     *  -> execution params -> auto-added codes/base_url. Null module means environment-only. */
    private String resolveEnvConfigJson(Long environmentId, ModuleEntity module) {
        ObjectNode node = objectMapper.createObjectNode();
        if (environmentId == null) {
            return node.toString();
        }
        EnvironmentEntity env = environmentRepository.findById(environmentId).orElse(null);
        if (env == null) {
            return node.toString();
        }
        mergeJsonInto(node, env.getConfigJson(), environmentId, "environment");

        ModuleEnvironmentEntity mapping = null;
        if (module != null) {
            mapping = moduleEnvironmentRepository.findByModuleIdAndEnvironmentId(module.getId(), environmentId).orElse(null);
            if (mapping != null) {
                mergeJsonInto(node, mapping.getConfigJson(), environmentId, "module_environments.config_json");
                mergeJsonInto(node, mapping.getExecutionParamsJson(), environmentId, "module_environments.execution_params_json");
            }
        }

        if (env.getCode() != null) node.put("environment.code", env.getCode());
        if (env.getName() != null) node.put("environment.name", env.getName());
        if (module != null && module.getCode() != null) node.put("module.code", module.getCode());
        String baseUrl = ModuleEnvironmentResolver.resolveBaseUrl(mapping, env.getBaseUrl());
        if (baseUrl != null) node.put("environment.base_url", baseUrl);
        return node.toString();
    }

    private void mergeJsonInto(ObjectNode target, String rawJson, Long environmentId, String sourceLabel) {
        if (rawJson == null || rawJson.isBlank()) {
            return;
        }
        try {
            target.setAll((ObjectNode) objectMapper.readTree(rawJson));
        } catch (Exception e) {
            log.warn("Environment {} has invalid {}, skipping it for this run", environmentId, sourceLabel, e);
        }
    }

    private int resolveTimeoutMinutes(Long environmentId, ModuleEntity module) {
        if (environmentId == null || module == null) {
            return 120;
        }
        return moduleEnvironmentRepository.findByModuleIdAndEnvironmentId(module.getId(), environmentId)
                .map(mapping -> ModuleEnvironmentResolver.resolveTimeoutMinutes(mapping, 120))
                .orElse(120);
    }

    private String resolveReportPathForXml(String xmlFileName) {
        if (xmlFileName == null) return "reports/MasterReport2.html";
        // Look up from DB first
        return moduleRepository.findAll().stream()
                .filter(m -> xmlFileName.equals(m.getXmlFile()) && m.getReportPath() != null)
                .findFirst()
                .map(ModuleEntity::getReportPath)
                .orElseGet(() -> xmlFileName.toLowerCase().contains("emp_arch")
                        ? "reports/MasterReport.html"
                        : "reports/MasterReport2.html");
    }

    public void copyExecutionArtifacts(Execution execution) {
        try {
            String repoPath = properties.getRepositoryPath();
            String artifactsRoot = properties.getArtifactsRoot();
            String executionCode = execution.getExecutionCode();

            // Resolve suite report: prefer DB lookup by module code, then by xml file
            String suiteReport = "reports/MasterReport2.html";
            if (execution.getModuleCode() != null) {
                suiteReport = moduleRepository.findByCodeAndRunnerType(execution.getModuleCode().toUpperCase(), execution.getFramework())
                        .filter(m -> m.getReportPath() != null)
                        .map(ModuleEntity::getReportPath)
                        .orElseGet(() -> resolveReportPathForXml(execution.getSuiteXmlPath()));
            } else {
                suiteReport = resolveReportPathForXml(execution.getSuiteXmlPath());
            }

            Path artifactBaseDir = Path.of(artifactsRoot, "executions", executionCode);
            Files.createDirectories(artifactBaseDir.resolve("reports"));
            Files.createDirectories(artifactBaseDir.resolve("xml"));
            Files.createDirectories(artifactBaseDir.resolve("screenshots"));
            Files.createDirectories(artifactBaseDir.resolve("logs"));

            // SUITE_COMPLETED fires from afterSuite, but TestNG's XMLReporter writes
            // testng-results.xml later in its own shutdown. Wait a bounded window for it.
            waitForFile(new File(repoPath, properties.getResultFiles().getOrDefault("testng-results", "")), 10, 500);

            // Copy files
            copyArtifacts(repoPath, artifactBaseDir.toString(), executionCode, suiteReport);

            // Re-parse testng-results.xml as the structured source of truth: fills in
            // parameters, groups/tags and per-step logs that the live event stream doesn't carry.
            mergeTestNgXmlResults(execution, artifactBaseDir, artifactsRoot);

            // Save console log artifact if it exists
            File consoleLogFile = artifactBaseDir.resolve("logs/console.log").toFile();
            if (consoleLogFile.exists()) {
                saveArtifactRecord(execution.getId(), "CONSOLE_LOG", consoleLogFile);
            }
            
            // Update final report path in execution
            File copiedReport = artifactBaseDir.resolve(suiteReport).toFile();
            if (!copiedReport.exists()) {
                String reportBaseName = Path.of(suiteReport).getFileName().toString();
                copiedReport = artifactBaseDir.resolve("reports").resolve(reportBaseName).toFile();
            }
            if (copiedReport.exists()) {
                Path relative = Path.of(artifactsRoot).toAbsolutePath().relativize(copiedReport.toPath().toAbsolutePath());
                execution.setFinalReportPath(relative.toString().replace("\\", "/"));
                executionRepository.save(execution);
            }
            
            log.info("Artifacts successfully copied for execution: {}", executionCode);
        } catch (Exception e) {
            log.error("Failed to copy artifacts for execution: {}", execution.getExecutionCode(), e);
        }
    }

    /** Playwright's counterpart to copyExecutionArtifacts(): no TestNG XML to parse, just walks
     *  test-results/ and records through the same saveArtifactRecord(), so the Artifacts tab
     *  needs no per-framework branching. */
    public void copyPlaywrightArtifacts(Execution execution) {
        try {
            String playwrightPath = resolvePlaywrightPath(execution);
            if (playwrightPath == null || playwrightPath.isBlank()) {
                log.warn("portal.automation.playwright-path is not configured — skipping artifact copy for execution: {}", execution.getExecutionCode());
                return;
            }
            String artifactsRoot = properties.getArtifactsRoot();
            String executionCode = execution.getExecutionCode();

            Path testResultsDir = Path.of(playwrightPath, "test-results");
            if (!Files.exists(testResultsDir)) {
                log.warn("No Playwright test-results directory found at {} for execution: {}", testResultsDir, executionCode);
                return;
            }

            Path artifactBaseDir = Path.of(artifactsRoot, "executions", executionCode);
            Files.createDirectories(artifactBaseDir.resolve("screenshots"));
            Files.createDirectories(artifactBaseDir.resolve("videos"));
            Files.createDirectories(artifactBaseDir.resolve("traces"));

            List<Path> files;
            try (Stream<Path> walk = Files.walk(testResultsDir)) {
                files = walk.filter(Files::isRegularFile).collect(Collectors.toList());
            }

            for (Path src : files) {
                String name = src.getFileName().toString();
                String subDir;
                String artifactType;
                if (name.endsWith(".png")) {
                    subDir = "screenshots";
                    artifactType = "SCREENSHOT";
                } else if (name.endsWith(".webm")) {
                    subDir = "videos";
                    artifactType = "VIDEO";
                } else if (name.endsWith(".zip")) {
                    subDir = "traces";
                    artifactType = "TRACE";
                } else {
                    continue;
                }
                File dest = artifactBaseDir.resolve(subDir).resolve(name).toFile();
                Files.copy(src, dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
                saveArtifactRecord(execution.getId(), artifactType, dest);
            }

            log.info("Playwright artifacts successfully copied for execution: {}", executionCode);
        } catch (Exception e) {
            log.error("Failed to copy Playwright artifacts for execution: {}", execution.getExecutionCode(), e);
        }
    }

    /** Mirrors processExecution()'s dispatch-time resolution so artifact copy reads the directory
     *  the run actually executed in — otherwise a project-specific run dispatches correctly but
     *  silently pulls artifacts from the shared checkout. */
    private String resolvePlaywrightPath(Execution execution) {
        if (execution.getTestEngineId() != null) {
            TestEngine engine = testEngineRepository.findById(execution.getTestEngineId()).orElse(null);
            if (engine != null && engine.getFrameworkPath() != null && !engine.getFrameworkPath().isBlank()) {
                String root = properties.getProjectFrameworksRoot();
                if (root != null && !root.isBlank()) {
                    return Path.of(root, engine.getFrameworkPath()).toString();
                }
            }
        }
        return properties.getPlaywrightPath();
    }

    private void waitForFile(File file, int maxAttempts, long delayMs) {
        for (int i = 0; i < maxAttempts; i++) {
            if (file.exists()) return;
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    /** The live event stream creates test-case rows but carries no parameters, tags or per-step
     *  logs. testng-results.xml is the source of truth for those, so merge the gaps in after the
     *  run rather than duplicating rows the live pipeline already made. */
    private void mergeTestNgXmlResults(Execution execution, Path artifactBaseDir, String artifactsRoot) {
        try {
            File resultsXml = artifactBaseDir.resolve("xml/testng-results.xml").toFile();
            if (!resultsXml.exists()) {
                log.warn("No testng-results.xml found to merge for execution {}", execution.getExecutionCode());
                return;
            }

            List<ExecutionTestCase> parsed = testNGXmlParser.parse(
                    resultsXml, execution.getId(), execution.getExecutionCode(), artifactsRoot);

            for (ExecutionTestCase parsedTc : parsed) {
                // Match on class+method only: the live event stream's "testName" is the
                // per-test-case label (e.g. "TC_001"), while testng-results.xml's testName is the
                // enclosing <test> tag (e.g. "Land Management Suite") — they're not comparable.
                ExecutionTestCase tc = testCaseRepository
                        .findFirstByExecutionIdAndClassNameAndMethodName(
                                execution.getId(), parsedTc.getClassName(), parsedTc.getMethodName())
                        .orElse(null);

                boolean isNew = tc == null;
                if (isNew) {
                    tc = parsedTc;
                } else {
                    if (tc.getParameters() == null) tc.setParameters(parsedTc.getParameters());
                    if (tc.getScreenshotPath() == null) tc.setScreenshotPath(parsedTc.getScreenshotPath());
                    if (tc.getSuiteName() == null) tc.setSuiteName(parsedTc.getSuiteName());
                    if (tc.getStatus() == null || "RUNNING".equalsIgnoreCase(tc.getStatus())) {
                        tc.setStatus(parsedTc.getStatus());
                    }
                    if (tc.getRetries() < parsedTc.getRetries()) tc.setRetries(parsedTc.getRetries());
                }
                tc.setConfigMethod(parsedTc.isConfigMethod());

                for (Tag parsedTag : parsedTc.getTags()) {
                    Tag persistedTag = tagRepository.findByName(parsedTag.getName())
                            .orElseGet(() -> tagRepository.save(new Tag(parsedTag.getName())));
                    tc.getTags().add(persistedTag);
                }

                tc = testCaseRepository.save(tc);

                if (testStepRepository.findByTestCaseIdOrderByStepOrder(tc.getId()).isEmpty()) {
                    for (TestStep step : parsedTc.getTransientSteps()) {
                        step.setTestCaseId(tc.getId());
                        testStepRepository.save(step);
                    }
                }
            }

            log.info("Merged testng-results.xml data ({} test cases) for execution {}", parsed.size(), execution.getExecutionCode());
        } catch (Exception e) {
            log.error("Failed to merge testng-results.xml for execution {}", execution.getExecutionCode(), e);
        }
    }

    private void copyArtifacts(String repoPath, String targetDir, String executionCode, String suiteReport) {
        try {
            for (Map.Entry<String, String> entry : properties.getResultFiles().entrySet()) {
                String type = entry.getKey();
                String relPath = entry.getValue();

                File src = new File(repoPath, relPath);
                if (!src.exists()) continue;

                File dest;
                String artifactType;
                if ("testng-results".equals(type)) {
                    dest = new File(targetDir, "xml/testng-results.xml");
                    artifactType = "TESTNG_RESULTS_XML";
                } else if ("testng-failed".equals(type)) {
                    dest = new File(targetDir, "xml/testng-failed.xml");
                    artifactType = "TESTNG_FAILED_XML";
                } else if ("emailable-report".equals(type)) {
                    dest = new File(targetDir, "reports/emailable-report.html");
                    artifactType = "EMAILABLE_REPORT";
                } else if ("index-report".equals(type)) {
                    dest = new File(targetDir, "reports/index.html");
                    artifactType = "TESTNG_HTML_REPORT";
                } else if ("screenshots".equals(type)) {
                    copyDirectory(src, new File(targetDir, "screenshots"), executionCode, "SCREENSHOT");
                    continue;
                } else if ("logs".equals(type)) {
                    copyDirectory(src, new File(targetDir, "logs"), executionCode, "FRAMEWORK_LOG");
                    continue;
                } else {
                    continue;
                }

                Files.copy(src.toPath(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
                saveArtifactRecord(executionRepository.findByExecutionCode(executionCode).get(0).getId(), artifactType, dest);
            }

            File extentReportSrc = new File(repoPath, suiteReport);
            if (extentReportSrc.exists()) {
                String reportBaseName = Path.of(suiteReport).getFileName().toString();
                File extentReportDest = new File(targetDir, "reports/" + reportBaseName);
                Files.copy(extentReportSrc.toPath(), extentReportDest.toPath(), StandardCopyOption.REPLACE_EXISTING);
                saveArtifactRecord(executionRepository.findByExecutionCode(executionCode).get(0).getId(), "EXTENT_REPORT", extentReportDest);
            }

        } catch (Exception e) {
            log.error("Error copying artifacts", e);
        }
    }

    private void copyDirectory(File source, File destination, String executionCode, String artifactType) throws IOException {
        if (source.isDirectory()) {
            if (!destination.exists()) {
                destination.mkdirs();
            }
            File[] files = source.listFiles();
            if (files != null) {
                for (File file : files) {
                    copyDirectory(file, new File(destination, file.getName()), executionCode, artifactType);
                }
            }
        } else {
            Files.copy(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING);
            Long execId = executionRepository.findByExecutionCode(executionCode).get(0).getId();
            saveArtifactRecord(execId, artifactType, destination);
        }
    }

    private void saveArtifactRecord(Long executionId, String type, File file) {
        try {
            ExecutionArtifact artifact = new ExecutionArtifact();
            artifact.setExecutionId(executionId);
            artifact.setArtifactType(type);
            artifact.setFileName(file.getName());
            
            Path relative = Path.of(properties.getArtifactsRoot()).toAbsolutePath().relativize(file.toPath().toAbsolutePath());
            artifact.setFilePath(relative.toString().replace("\\", "/"));
            
            String mime = Files.probeContentType(file.toPath());
            artifact.setMimeType(mime != null ? mime : "application/octet-stream");
            artifact.setSizeBytes(file.length());

            artifactRepository.save(artifact);
        } catch (Exception e) {
            log.error("Failed to save artifact record", e);
        }
    }

    private void logToDb(Long executionId, String level, String message, String source) {
        try {
            ExecutionLog logRec = new ExecutionLog();
            logRec.setExecutionId(executionId);
            logRec.setLevel(level);
            logRec.setMessage(message);
            logRec.setSource(source);
            logRepository.save(logRec);
        } catch (Exception e) {
            log.error("Failed to write log to DB", e);
        }
    }
}
