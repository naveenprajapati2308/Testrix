package com.automationportal.executions;

import com.automationportal.security.CurrentUserService;
import com.automationportal.config.PortalAutomationProperties;
import com.automationportal.events.LiveBroadcastService;
import com.automationportal.events.ExecutionEventPayload;
import com.automationportal.events.ExecutionEventType;
import com.automationportal.frameworks.FrameworkRegistry;
import com.automationportal.moduleenvironments.ModuleEnvironmentEntity;
import com.automationportal.moduleenvironments.ModuleEnvironmentRepository;
import com.automationportal.moduleenvironments.ModuleEnvironmentResolver;
import com.automationportal.modules.ModuleEntity;
import com.automationportal.modules.ModuleRepository;
import com.automationportal.security.CurrentProjectService;
import com.automationportal.security.ProjectContext;
import com.automationportal.security.ProjectContextHolder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ExecutionService {
    private static final Logger log = LoggerFactory.getLogger(ExecutionService.class);

    // Generous on purpose: a real Selenium run can legitimately take this long. It only needs to
    // catch runs that are actually stuck — see reapStaleRunningExecutions() for why it is
    // time-based rather than driven by the runner's process-exit signal.
    private static final java.time.Duration STALE_RUNNING_GRACE_PERIOD = java.time.Duration.ofMinutes(20);

    private final ExecutionRepository repository;
    private final ExecutionTestCaseRepository testCaseRepository;
    private final ExecutionArtifactRepository artifactRepository;
    private final ExecutionLogRepository logRepository;
    private final PortalAutomationProperties properties;
    private final ExecutionWorker worker;
    private final LiveBroadcastService broadcastService;
    private final ModuleRepository moduleRepository;
    private final ModuleEnvironmentRepository moduleEnvironmentRepository;
    private final FrameworkRegistry frameworkRegistry;
    private final CurrentUserService currentUserService;
    private final ExecutionIdGeneratorService executionIdGeneratorService;
    private final CurrentProjectService currentProjectService;

    public ExecutionService(ExecutionRepository repository,
                            ExecutionTestCaseRepository testCaseRepository,
                            ExecutionArtifactRepository artifactRepository,
                            ExecutionLogRepository logRepository,
                            PortalAutomationProperties properties,
                            @Lazy ExecutionWorker worker,
                            LiveBroadcastService broadcastService,
                            ModuleRepository moduleRepository,
                            ModuleEnvironmentRepository moduleEnvironmentRepository,
                            FrameworkRegistry frameworkRegistry,
                            CurrentUserService currentUserService,
                            ExecutionIdGeneratorService executionIdGeneratorService,
                            CurrentProjectService currentProjectService) {
        this.repository = repository;
        this.testCaseRepository = testCaseRepository;
        this.artifactRepository = artifactRepository;
        this.logRepository = logRepository;
        this.properties = properties;
        this.worker = worker;
        this.broadcastService = broadcastService;
        this.moduleRepository = moduleRepository;
        this.moduleEnvironmentRepository = moduleEnvironmentRepository;
        this.frameworkRegistry = frameworkRegistry;
        this.currentUserService = currentUserService;
        this.executionIdGeneratorService = executionIdGeneratorService;
        this.currentProjectService = currentProjectService;
    }

    public Execution queue(RunExecutionRequest request, Long triggeredByUserId) {
        // A real caller identity is required to queue a run — Super Admin (no project context)
        // is deliberately not a day-to-day execution trigger, matching how they never got a
        // project_users row in V21's backfill.
        return queueForProject(request, triggeredByUserId, currentProjectService.requireProjectId());
    }

    // Shared by queue() and rerun(): a rerun must stamp the ORIGINAL execution's project, since
    // a Super Admin may rerun anything but has no project context of their own.
    private Execution queueForProject(RunExecutionRequest request, Long triggeredByUserId, Long projectId) {
        String framework = request.framework() != null && !request.framework().isBlank() ? request.framework() : "MAVEN_TESTNG";

        if (request.executionType() == ExecutionType.MODULE) {
            validateModuleEnvironmentBrowser(request.moduleCode(), framework, request.environmentId(), request.requestedBrowser(), projectId);
        } else if (request.executionType() == ExecutionType.XML_SUITE) {
            // Raw-path submission bypasses Module validation, so without this a project with no
            // framework wired up could execute another project's suite file — the same
            // cross-tenant leak the suites-listing gate closes for discovery, closed for
            // submission. Owning a raw path requires at least one Module for that framework.
            if (moduleRepository.findByProjectIdAndRunnerType(projectId, framework).isEmpty()) {
                throw new IllegalArgumentException(
                        "No framework is connected for this project yet — an admin needs to register a Test Engine/Module before suites can be run.");
            }
        }

        Execution execution = new Execution();
        execution.setProjectId(projectId);
        execution.setExecutionCode(executionIdGeneratorService.next(resolveFrameworkShortCode(framework)));
        execution.setExecutionType(request.executionType());
        execution.setEnvironmentId(request.environmentId());
        execution.setModuleCode(request.executionType() == ExecutionType.ALL_MODULES ? "ALL" : request.moduleCode());
        execution.setSuiteXmlPath(request.suiteXmlPath());
        execution.setFramework(framework);
        execution.setRequestedBrowser(request.requestedBrowser());
        execution.setTagFilter(request.tagFilter());
        execution.setTriggeredBy(triggeredByUserId);
        execution.setStatus(ExecutionStatus.QUEUED);
        return repository.save(execution);
    }

    // Resolves a framework's short code (e.g. "SL", "PL") from the registry rather than
    // hardcoding it here, so a newly registered framework gets a meaningful execution ID with
    // no change to this class — see FrameworkRegistry/FrameworkDescriptor.shortCode().
    private String resolveFrameworkShortCode(String framework) {
        return frameworkRegistry.find(framework)
                .map(fw -> fw.shortCode())
                .orElse("GEN");
    }

    /** Server-side enforcement of Framework -> Module -> Environment -> Browser: the frontend
     *  hides invalid combinations, but nothing stopped a raw API call from bypassing that. Also
     *  enforces the module's optional allowedRoles list. */
    private void validateModuleEnvironmentBrowser(String moduleCode, String framework, Long environmentId, String requestedBrowser, Long projectId) {
        if (moduleCode == null || moduleCode.isBlank()) {
            return;
        }
        ModuleEntity module = moduleRepository.findByCodeAndRunnerType(moduleCode.toUpperCase(), framework)
                .filter(m -> projectId.equals(m.getProjectId()))
                .orElseThrow(() -> new IllegalArgumentException(
                        "Module '" + moduleCode + "' does not exist for framework " + framework));

        ModuleEnvironmentEntity mapping = moduleEnvironmentRepository
                .findByModuleIdAndEnvironmentIdAndEnabledTrue(module.getId(), environmentId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Module '" + module.getCode() + "' is not enabled for the selected environment"));

        if (requestedBrowser != null && !requestedBrowser.isBlank()) {
            List<String> frameworkBrowsers = frameworkRegistry.find(framework)
                    .map(fw -> fw.browsers())
                    .orElse(List.of());
            List<String> allowedBrowsers = ModuleEnvironmentResolver.resolveBrowsers(mapping, frameworkBrowsers);
            if (!allowedBrowsers.contains(requestedBrowser)) {
                throw new IllegalArgumentException(
                        "Browser '" + requestedBrowser + "' is not supported for this module/environment (supported: " + allowedBrowsers + ")");
            }
        }

        if (module.getAllowedRoles() != null && !module.getAllowedRoles().isBlank()) {
            List<String> allowedRoles = Arrays.stream(module.getAllowedRoles().split(","))
                    .map(String::trim).filter(s -> !s.isEmpty()).toList();
            // Project-scoped users all carry platform role VIEWER; their real authority is the
            // project role. OR-ing the platform role in would make "VIEWER" match everyone and
            // defeat the ACL, so it is consulted only for legacy accounts with no project.
            ProjectContext context = ProjectContextHolder.get();
            boolean roleMatches;
            if (context != null) {
                roleMatches = context.projectRoles() != null
                        && context.projectRoles().stream().anyMatch(allowedRoles::contains);
            } else {
                String currentRole = currentUserService.currentUser().role();
                roleMatches = currentRole != null && allowedRoles.contains(currentRole);
            }
            if (!roleMatches) {
                throw new IllegalArgumentException("You do not have permission to execute this module.");
            }
        }
    }

    /** Permanently removes an execution and every trace of it: test cases, artifacts, logs, the
     *  EM job/queue rows, the execution row, and the copied artifact files on disk. */
    @Transactional
    public void delete(Long id) {
        Execution e = requireExecutionAccess(id);
        if (e.getStatus() == ExecutionStatus.QUEUED || e.getStatus() == ExecutionStatus.RUNNING) {
            throw new IllegalStateException("Cannot delete a QUEUED/RUNNING execution — cancel it first.");
        }
        repository.deleteTestStepsFor(id);
        repository.deleteTestCaseTagLinksFor(id);
        repository.deleteTestCasesFor(id);
        repository.deleteArtifactRowsFor(id);
        repository.deleteLogRowsFor(id);
        repository.deleteJobRowsFor(id);
        repository.deleteQueueRowsFor(id);
        repository.delete(e);
        deleteArtifactDirectory(e.getExecutionCode());
    }

    private void deleteArtifactDirectory(String executionCode) {
        if (executionCode == null || executionCode.isBlank()) return;
        try {
            Path root = Path.of(properties.getArtifactsRoot()).toAbsolutePath().normalize();
            Path dir = root.resolve("executions").resolve(executionCode).normalize();
            if (!dir.startsWith(root) || !Files.exists(dir)) return;
            try (var walk = Files.walk(dir)) {
                walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                    try { Files.delete(p); } catch (IOException ignored) { }
                });
            }
        } catch (IOException ignored) {
            // DB cleanup already committed; leftover files are harmless and re-deletable.
        }
    }

    public List<Execution> recent() {
        Long projectId = currentProjectService.requireProjectId();
        return repository.findTop25ByProjectIdOrderByCreatedAtDesc(projectId);
    }

    public List<Execution> filter(String status, String module, String framework, Instant from, Instant to) {
        Long projectId = currentProjectService.requireProjectId();
        return repository.findAll().stream()
                .filter(e -> projectId.equals(e.getProjectId()))
                .filter(e -> status == null || status.trim().isEmpty() || e.getStatus().toString().equalsIgnoreCase(status))
                .filter(e -> module == null || module.trim().isEmpty() || (e.getModuleCode() != null && e.getModuleCode().equalsIgnoreCase(module)))
                .filter(e -> framework == null || framework.trim().isEmpty() || (e.getFramework() != null && e.getFramework().equalsIgnoreCase(framework)))
                .filter(e -> from == null || (e.getCreatedAt() != null && e.getCreatedAt().isAfter(from)))
                .filter(e -> to == null || (e.getCreatedAt() != null && e.getCreatedAt().isBefore(to)))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .collect(Collectors.toList());
    }

    public void cancel(Long id) {
        requireExecutionAccess(id);
        worker.cancelExecution(id);
    }

    public Execution rerun(Long id, Long triggeredByUserId) {
        Execution old = requireExecutionAccess(id);
        RunExecutionRequest req = new RunExecutionRequest(
                old.getExecutionType(),
                old.getEnvironmentId(),
                old.getModuleCode(),
                old.getSuiteXmlPath(),
                old.getFramework(),
                old.getRequestedBrowser(),
                old.getTagFilter()
        );
        return queueForProject(req, triggeredByUserId, old.getProjectId());
    }

    public Execution rerunFailed(Long id, Long triggeredByUserId) {
        Execution old = requireExecutionAccess(id);

        // Find failed xml artifact
        List<ExecutionArtifact> failedArtifacts = artifactRepository.findByExecutionIdAndArtifactType(id, "TESTNG_FAILED_XML");
        if (failedArtifacts.isEmpty()) {
            throw new IllegalArgumentException("No testng-failed.xml found for execution " + id);
        }

        ExecutionArtifact artifact = failedArtifacts.get(0);
        Path src = Path.of(properties.getArtifactsRoot(), artifact.getFilePath());
        if (!Files.exists(src)) {
            throw new IllegalArgumentException("Failed XML file does not exist on disk: " + src.toAbsolutePath());
        }

        // Create new execution code
        String newCode = executionIdGeneratorService.next(resolveFrameworkShortCode(old.getFramework()));
        String tempSuiteName = "testng-failed-temp-" + newCode + ".xml";
        Path dest = Path.of(properties.getRepositoryPath(), tempSuiteName);

        try {
            Files.copy(src, dest);
        } catch (IOException e) {
            throw new RuntimeException("Failed to copy failed XML suite to framework folder", e);
        }

        Execution execution = new Execution();
        execution.setProjectId(old.getProjectId());
        execution.setExecutionCode(newCode);
        execution.setExecutionType(ExecutionType.XML_SUITE);
        execution.setEnvironmentId(old.getEnvironmentId());
        execution.setModuleCode(old.getModuleCode());
        execution.setSuiteXmlPath(tempSuiteName);
        execution.setFramework(old.getFramework());
        execution.setRequestedBrowser(old.getRequestedBrowser());
        execution.setTagFilter(old.getTagFilter());
        execution.setTriggeredBy(triggeredByUserId);
        execution.setStatus(ExecutionStatus.QUEUED);

        return repository.save(execution);
    }

    public List<ExecutionTestCase> getTestCases(Long id) {
        requireExecutionAccess(id);
        return testCaseRepository.findByExecutionIdWithTags(id);
    }

    public List<ExecutionArtifact> getArtifacts(Long id) {
        requireExecutionAccess(id);
        return artifactRepository.findByExecutionId(id);
    }

    public List<ExecutionLog> getLogs(Long id) {
        requireExecutionAccess(id);
        return logRepository.findByExecutionId(id);
    }

    public Map<String, Object> getSummary(Long id) {
        Execution e = requireExecutionAccess(id);
        Map<String, Object> map = new HashMap<>();
        map.put("executionCode", e.getExecutionCode());
        map.put("status", e.getStatus());
        map.put("totalTests", e.getTotalTests());
        map.put("passed", e.getPassedTests());
        map.put("failed", e.getFailedTests());
        map.put("skipped", e.getSkippedTests());
        map.put("passRate", e.getPassRate());
        map.put("failRate", e.getFailRate());
        map.put("durationSeconds", e.getDurationSeconds());
        map.put("startTime", e.getStartTime());
        map.put("endTime", e.getEndTime());
        map.put("machineName", e.getMachineName());
        map.put("osName", e.getOsName());
        map.put("javaVersion", e.getJavaVersion());
        map.put("browserName", e.getBrowserName());
        map.put("finalReportPath", e.getFinalReportPath());
        return map;
    }

    public void updateState(Long id, String state) {
        Execution e = repository.findById(id).orElseThrow();
        ExecutionStatus status = ExecutionStatus.valueOf(state);
        e.setStatus(status);
        if (status == ExecutionStatus.RUNNING && e.getStartTime() == null) {
            e.setStartTime(Instant.now());
        } else if (status == ExecutionStatus.COMPLETED || status == ExecutionStatus.CANCELLED || status == ExecutionStatus.ERROR) {
            e.setEndTime(Instant.now());
            if (e.getStartTime() != null) {
                e.setDurationSeconds(java.time.Duration.between(e.getStartTime(), e.getEndTime()).toSeconds());
            }
        }
        repository.save(e);

        // Broadcast state update to frontend SSE clients
        ExecutionEventPayload payload = new ExecutionEventPayload();
        payload.setExecutionId(e.getExecutionCode());
        payload.setTimestamp(java.time.LocalDateTime.now());
        
        if (status == ExecutionStatus.RUNNING) {
            payload.setEventType(ExecutionEventType.EXECUTION_STARTING);
        } else {
            payload.setEventType(ExecutionEventType.SUITE_COMPLETED);
        }
        broadcastService.broadcast(e.getExecutionCode(), payload);
    }

    /** Called when the runner process exits. Normally a no-op, since the listener already pushed
     *  SUITE_COMPLETED. But if the run died before TestNG started no listener code runs at all,
     *  and the execution — plus pollQueue()'s one-RUNNING-at-a-time gate — would stick forever. */
    public void markStaleIfStillRunning(Long id) {
        Execution e = repository.findById(id).orElseThrow();
        if (e.getStatus() != ExecutionStatus.RUNNING) {
            return;
        }
        e.setStatus(ExecutionStatus.ERROR);
        e.setEndTime(Instant.now());
        if (e.getStartTime() != null) {
            e.setDurationSeconds(java.time.Duration.between(e.getStartTime(), e.getEndTime()).toSeconds());
        }
        repository.save(e);

        ExecutionLog logRec = new ExecutionLog();
        logRec.setExecutionId(id);
        logRec.setLevel("ERROR");
        logRec.setMessage("No completion signal received within the stale-execution grace period (" + STALE_RUNNING_GRACE_PERIOD.toMinutes() + " min) — marked as ERROR so the execution queue isn't blocked.");
        logRec.setSource("SYSTEM");
        logRepository.save(logRec);

        ExecutionEventPayload payload = new ExecutionEventPayload();
        payload.setExecutionId(e.getExecutionCode());
        payload.setTimestamp(java.time.LocalDateTime.now());
        payload.setEventType(ExecutionEventType.SUITE_COMPLETED);
        broadcastService.broadcast(e.getExecutionCode(), payload);
    }

    // Sole path that force-terminates a stuck RUNNING execution. Triggering this on the runner's
    // process-exit signal raced slow-but-successful completions and clobbered real results with a
    // bogus ERROR. Time-based removes the race: in-progress runs are simply younger than the
    // grace period, so only genuinely stuck ones are reaped.
    @Scheduled(fixedDelay = 60000)
    public void reapStaleRunningExecutions() {
        Instant cutoff = Instant.now().minus(STALE_RUNNING_GRACE_PERIOD);
        List<Execution> stale = repository.findByStatusAndStartTimeBefore(ExecutionStatus.RUNNING, cutoff);
        for (Execution e : stale) {
            log.warn("Execution {} has been RUNNING since {}, past the {} grace period — marking ERROR",
                    e.getId(), e.getStartTime(), STALE_RUNNING_GRACE_PERIOD);
            markStaleIfStillRunning(e.getId());
        }
    }

    // Not used by updateState()/markStaleIfStillRunning()/reapStaleRunningExecutions() — those
    // are reached via the API-key-gated system callbacks or the @Scheduled reaper, both of which
    // have no request-scoped project context and must stay able to act on any execution.
    private Execution requireExecutionAccess(Long id) {
        Execution execution = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found: " + id));
        if (!currentProjectService.canAccess(execution.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found: " + id);
        }
        return execution;
    }
}
