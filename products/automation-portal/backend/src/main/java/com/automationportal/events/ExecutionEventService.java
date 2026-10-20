package com.automationportal.events;

import com.automationportal.executions.*;
import com.automationportal.testcasecatalog.TestCaseCatalogService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ExecutionEventService {
    private static final Logger log = LoggerFactory.getLogger(ExecutionEventService.class);

    private final ExecutionRepository executionRepository;
    private final ExecutionTestCaseRepository testCaseRepository;
    private final ExecutionArtifactRepository artifactRepository;
    private final ExecutionLogRepository logRepository;
    private final LiveBroadcastService broadcastService;
    private final ExecutionWorker executionWorker;
    private final com.automationportal.executions.TestStepRepository testStepRepository;
    private final TestCaseCatalogService testCaseCatalogService;
    private final HttpClient httpClient;

    @Value("${portal.execution-manager.url:http://localhost:8090}")
    private String executionManagerUrl;

    public ExecutionEventService(ExecutionRepository executionRepository,
            ExecutionTestCaseRepository testCaseRepository,
            ExecutionArtifactRepository artifactRepository,
            ExecutionLogRepository logRepository,
            LiveBroadcastService broadcastService,
            @org.springframework.context.annotation.Lazy ExecutionWorker executionWorker,
            com.automationportal.executions.TestStepRepository testStepRepository,
            TestCaseCatalogService testCaseCatalogService) {
        this.executionRepository = executionRepository;
        this.testCaseRepository = testCaseRepository;
        this.artifactRepository = artifactRepository;
        this.logRepository = logRepository;
        this.broadcastService = broadcastService;
        this.executionWorker = executionWorker;
        this.testStepRepository = testStepRepository;
        this.testCaseCatalogService = testCaseCatalogService;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
    }

    @Transactional
    public void processEvent(ExecutionEventPayload payload) {
        log.info("Processing event: {} for execution code: {}", payload.getEventType(), payload.getExecutionId());

        List<Execution> list = executionRepository.findByExecutionCode(payload.getExecutionId());
        if (list.isEmpty()) {
            log.warn("Received event for unknown execution code: {}", payload.getExecutionId());
            return;
        }

        Execution execution = list.get(0);

        if (isTerminal(execution.getStatus())) {
            log.warn(
                    "Ignoring {} event for execution {} - already in terminal status {} (likely a late event from an orphaned/already-finished run)",
                    payload.getEventType(), payload.getExecutionId(), execution.getStatus());
            return;
        }

        Map<String, Object> data = payload.getData();

        switch (payload.getEventType()) {
            case SUITE_STARTED:
                execution.setStatus(ExecutionStatus.RUNNING);
                execution.setStartTime(Instant.now());
                if (data != null) {
                    if (data.containsKey("suiteName")) {
                        String incomingSuiteName = (String) data.get("suiteName");

                        boolean trustworthy = incomingSuiteName != null && !incomingSuiteName.isBlank()
                                && !"PLAYWRIGHT".equalsIgnoreCase(execution.getFramework());
                        if (trustworthy) {
                            execution.setSuiteName(incomingSuiteName);
                        }
                    }
                    if (data.containsKey("browser")) {
                        execution.setBrowserName((String) data.get("browser"));
                    }
                    if (data.containsKey("browserVersion")) {
                        execution.setBrowserVersion((String) data.get("browserVersion"));
                    }
                    if (data.containsKey("os")) {
                        execution.setOsName((String) data.get("os"));
                    }
                    if (data.containsKey("javaVersion")) {
                        execution.setJavaVersion((String) data.get("javaVersion"));
                    }
                    // MPHIDB's PortalApiClient sends the machine name as "hostname"
                    if (data.containsKey("hostname")) {
                        execution.setMachineName((String) data.get("hostname"));
                    } else if (data.containsKey("machineName")) {
                        execution.setMachineName((String) data.get("machineName"));
                    }
                    if (data.containsKey("machineIp")) {
                        execution.setMachineIp((String) data.get("machineIp"));
                    }
                    // Seed the expected test count immediately so live progress isn't stuck at 0/0
                    // until the first test finishes.
                    if (data.containsKey("totalExpectedTests")) {
                        try {
                            execution.setTotalTests(((Number) data.get("totalExpectedTests")).intValue());
                        } catch (Exception ignored) {
                        }
                    }
                }
                executionRepository.save(execution);
                logToDb(execution.getId(), "INFO", "Suite started: " + execution.getSuiteName(), "SYSTEM");
                break;

            case MODULE_STARTED:
                if (data != null && data.containsKey("moduleName")) {
                    logToDb(execution.getId(), "INFO", "Module started: " + data.get("moduleName"), "SYSTEM");
                }
                break;

            case TEST_STARTED:
                if (data != null) {
                    String testName = (String) data.get("testName");
                    String className = (String) data.get("className");
                    String methodName = (String) data.get("methodName");

                    Optional<ExecutionTestCase> existing = testCaseRepository
                            .findFirstByExecutionIdAndTestNameAndClassNameAndMethodName(
                                    execution.getId(), testName, className, methodName);

                    ExecutionTestCase tc;
                    if (existing.isPresent()) {
                        tc = existing.get();
                        tc.setRetries(tc.getRetries() + 1);
                    } else {
                        tc = new ExecutionTestCase();
                        tc.setExecutionId(execution.getId());
                        tc.setTestName(testName);
                        tc.setClassName(className);
                        tc.setMethodName(methodName);
                        tc.setRetries(0);
                    }

                    tc.setDisplayName((String) data.get("displayName"));
                    tc.setModuleCode((String) data.get("moduleName"));
                    tc.setStatus("RUNNING");
                    tc.setStartTime(Instant.now());

                    if (data.containsKey("isConfigMethod")) {
                        tc.setConfigMethod(Boolean.TRUE.equals(data.get("isConfigMethod")));
                    }

                    testCaseRepository.save(tc);
                }
                break;

            case TEST_PASSED:
                if (data != null) {
                    updateTestCaseStatus(execution.getId(), data, "PASS");
                    updateLiveCounts(execution);
                }
                break;

            case TEST_FAILED:
                if (data != null) {
                    updateTestCaseStatus(execution.getId(), data, "FAIL");
                    updateLiveCounts(execution);
                }
                break;

            case TEST_SKIPPED:
                if (data != null) {
                    updateTestCaseStatus(execution.getId(), data, "SKIP");
                    updateLiveCounts(execution);
                }
                break;

            case SCREENSHOT_CAPTURED:
                if (data != null) {
                    String filePath = (String) data.get("filePath");
                    String testName = (String) data.get("testName");
                    String className = (String) data.get("className");
                    String methodName = (String) data.get("methodName");

                    ExecutionArtifact artifact = new ExecutionArtifact();
                    artifact.setExecutionId(execution.getId());
                    artifact.setArtifactType("SCREENSHOT");
                    artifact.setFileName(filePath != null ? new File(filePath).getName() : "screenshot.png");
                    artifact.setFilePath(filePath != null ? filePath.replace("\\", "/") : "");
                    artifact.setMimeType("image/png");
                    artifact.setSizeBytes(0L);
                    artifactRepository.save(artifact);

                    if (testName != null && className != null && methodName != null) {
                        Optional<ExecutionTestCase> tcOpt = testCaseRepository
                                .findFirstByExecutionIdAndTestNameAndClassNameAndMethodName(
                                        execution.getId(), testName, className, methodName);
                        if (tcOpt.isPresent()) {
                            ExecutionTestCase tc = tcOpt.get();
                            tc.setScreenshotPath(filePath);
                            testCaseRepository.save(tc);
                        }
                    }
                }
                break;

            case VIDEO_CAPTURED:
                if (data != null) {
                    String filePath = (String) data.get("filePath");

                    ExecutionArtifact artifact = new ExecutionArtifact();
                    artifact.setExecutionId(execution.getId());
                    artifact.setArtifactType("VIDEO");
                    artifact.setFileName(filePath != null ? new File(filePath).getName() : "video.webm");
                    artifact.setFilePath(filePath != null ? filePath.replace("\\", "/") : "");
                    artifact.setMimeType("video/webm");
                    artifact.setSizeBytes(0L);
                    artifactRepository.save(artifact);
                }
                break;

            case LOG_ENTRY:
                if (data != null) {
                    String levelStr = (String) data.getOrDefault("level", "INFO");
                    String msg = (String) data.getOrDefault("message", "");
                    String src = (String) data.getOrDefault("source", "FRAMEWORK");
                    logToDb(execution.getId(), levelStr, msg, src);
                }
                break;

            case MODULE_COMPLETED:
                if (data != null && data.containsKey("moduleName")) {
                    logToDb(execution.getId(), "INFO", "Module completed: " + data.get("moduleName"), "SYSTEM");
                }
                break;

            case SUITE_COMPLETED:
                finalizeExecution(execution, data);
                break;
        }

        // Broadcast to any active SSE subscribers
        broadcastService.broadcast(payload.getExecutionId(), payload);
    }

    private void updateTestCaseStatus(Long executionId, Map<String, Object> data, String status) {
        String testName = (String) data.get("testName");
        String className = (String) data.get("className");
        String methodName = (String) data.get("methodName");

        Optional<ExecutionTestCase> tcOpt = testCaseRepository
                .findFirstByExecutionIdAndTestNameAndClassNameAndMethodName(
                        executionId, testName, className, methodName);

        ExecutionTestCase tc;
        if (tcOpt.isPresent()) {
            tc = tcOpt.get();
        } else {
            tc = new ExecutionTestCase();
            tc.setExecutionId(executionId);
            tc.setTestName(testName);
            tc.setClassName(className);
            tc.setMethodName(methodName);
            tc.setModuleCode((String) data.get("moduleName"));
        }

        tc.setStatus(status);
        tc.setEndTime(Instant.now());

        if (data.containsKey("durationMs") && data.get("durationMs") != null) {
            tc.setDurationMs(Long.valueOf(data.get("durationMs").toString()));
        } else if (tc.getStartTime() != null) {
            tc.setDurationMs(Duration.between(tc.getStartTime(), tc.getEndTime()).toMillis());
        }

        if ("FAIL".equals(status)) {
            if (data.containsKey("exceptionType")) {
                tc.setExceptionType((String) data.get("exceptionType"));
            }
            if (data.containsKey("exceptionMessage")) {
                tc.setFailureReason((String) data.get("exceptionMessage"));
            }
            if (data.containsKey("stackTrace")) {
                tc.setStackTrace((String) data.get("stackTrace"));
            }
        }

        tc = testCaseRepository.save(tc);
        saveStepsIfPresent(tc.getId(), data);
        logToDb(executionId, "FAIL".equals(status) ? "ERROR" : "INFO",
                "Test Case " + status + ": " + testName + " in class " + className, "SYSTEM");
    }

    @SuppressWarnings("unchecked")
    private void saveStepsIfPresent(Long testCaseId, Map<String, Object> data) {
        Object rawSteps = data.get("steps");
        if (!(rawSteps instanceof List<?> stepsList) || stepsList.isEmpty()) {
            return;
        }
        if (!testStepRepository.findByTestCaseIdOrderByStepOrder(testCaseId).isEmpty()) {
            return;
        }
        int order = 0;
        for (Object rawStep : stepsList) {
            if (!(rawStep instanceof Map)) {
                continue;
            }
            Map<String, Object> stepData = (Map<String, Object>) rawStep;
            com.automationportal.executions.TestStep step = new com.automationportal.executions.TestStep();
            step.setTestCaseId(testCaseId);
            step.setStepOrder(order++);
            step.setStepName((String) stepData.getOrDefault("name", "Step " + step.getStepOrder()));
            step.setStatus((String) stepData.getOrDefault("status", "PASS"));
            if (stepData.get("durationMs") != null) {
                step.setDurationMs(Long.valueOf(stepData.get("durationMs").toString()));
            }
            if (stepData.get("errorMessage") != null) {
                step.setErrorMessage((String) stepData.get("errorMessage"));
            }
            testStepRepository.save(step);
        }
    }

    private void finalizeExecution(Execution execution, Map<String, Object> data) {
        // First pass: settle status/counts immediately from whatever the live event
        // stream has
        // captured, so the UI reflects completion without delay.
        recomputeExecutionTotals(execution, data);
        logToDb(execution.getId(), "INFO", "Suite execution completed. Status: " + execution.getStatus(), "SYSTEM");

        // Copy artifacts — Maven/TestNG's copy also re-parses testng-results.xml,
        // correcting
        // test cases the live stream left in a stale state (e.g. a SKIPPED test whose
        // terminal
        // event never arrived); Playwright has no equivalent XML to re-parse, just
        // files to copy.
        if ("PLAYWRIGHT".equalsIgnoreCase(execution.getFramework())) {
            executionWorker.copyPlaywrightArtifacts(execution);
        } else {
            executionWorker.copyExecutionArtifacts(execution);
        }

        // Second pass: recompute from the now-corrected test case rows so the
        // execution-level
        // summary (dashboard, reports) matches what's actually in execution_test_cases.
        recomputeExecutionTotals(execution, data);

        try {
            testCaseCatalogService.syncTestCasesForExecution(execution);
        } catch (Exception e) {
            log.error("Failed to sync test case catalog for execution {}", execution.getExecutionCode(), e);
        }

        // Notify Execution Manager of completion to release concurrency slot
        notifyExecutionManagerCompleted(execution.getExecutionCode());
    }

    private record Counts(int total, int passed, int failed, int skipped, long totalDurationMs) {
    }

    private Counts computeCounts(Long executionId) {
        List<ExecutionTestCase> testCases = testCaseRepository.findByExecutionId(executionId);

        int total = 0, passed = 0, failed = 0, skipped = 0;
        long totalDurationMs = 0;

        for (ExecutionTestCase tc : testCases) {
            if (tc.getDurationMs() != null) {
                totalDurationMs += tc.getDurationMs();
            }
            if (!tc.isConfigMethod()) {
                total++;
                if ("PASS".equalsIgnoreCase(tc.getStatus()))
                    passed++;
                else if ("FAIL".equalsIgnoreCase(tc.getStatus()))
                    failed++;
                else if ("SKIP".equalsIgnoreCase(tc.getStatus()))
                    skipped++;
            }
        }

        return new Counts(total, passed, failed, skipped, totalDurationMs);
    }

    private void updateLiveCounts(Execution execution) {
        Counts c = computeCounts(execution.getId());
        execution.setTotalTests(c.total());
        execution.setPassedTests(c.passed());
        execution.setFailedTests(c.failed());
        execution.setSkippedTests(c.skipped());
        execution.setTotalDurationMs(c.totalDurationMs());
        executionRepository.save(execution);
    }

    private void recomputeExecutionTotals(Execution execution, Map<String, Object> data) {
        Counts c = computeCounts(execution.getId());
        int total = c.total(), passed = c.passed(), failed = c.failed(), skipped = c.skipped();
        long totalDurationMs = c.totalDurationMs();

        if (total == 0 && execution.getTotalTests() > 0) {
            total = execution.getTotalTests();
            passed = execution.getPassedTests();
            failed = execution.getFailedTests();
            skipped = execution.getSkippedTests();
        } else {
            execution.setTotalTests(total);
            execution.setPassedTests(passed);
            execution.setFailedTests(failed);
            execution.setSkippedTests(skipped);
        }
        execution.setTotalDurationMs(totalDurationMs);
        execution.setEndTime(Instant.now());

        if (data != null && data.get("durationSeconds") != null) {
            execution.setDurationSeconds(Long.valueOf(data.get("durationSeconds").toString()));
        } else if (execution.getStartTime() != null) {
            execution
                    .setDurationSeconds(Duration.between(execution.getStartTime(), execution.getEndTime()).toSeconds());
        } else {
            execution.setDurationSeconds(totalDurationMs / 1000);
        }

        if (total > 0) {
            BigDecimal pRate = BigDecimal.valueOf((passed * 100.0) / total).setScale(2, RoundingMode.HALF_UP);
            BigDecimal fRate = BigDecimal.valueOf((failed * 100.0) / total).setScale(2, RoundingMode.HALF_UP);
            execution.setPassRate(pRate);
            execution.setFailRate(fRate);
            execution.setPassPercentage(pRate);
            execution.setFailPercentage(fRate);
        } else {
            execution.setPassRate(BigDecimal.ZERO);
            execution.setFailRate(BigDecimal.ZERO);
            execution.setPassPercentage(BigDecimal.ZERO);
            execution.setFailPercentage(BigDecimal.ZERO);
        }

        if (total == 0) {
            execution.setStatus(ExecutionStatus.ERROR);
        } else if (failed == 0 && skipped == 0) {
            execution.setStatus(ExecutionStatus.PASSED);
        } else if (failed > 0 && passed > 0) {
            execution.setStatus(ExecutionStatus.PARTIAL);
        } else if (failed > 0 && passed == 0) {
            execution.setStatus(ExecutionStatus.FAILED);
        } else if (skipped > 0 && failed == 0) {
            execution.setStatus(ExecutionStatus.PARTIAL);
        } else {
            execution.setStatus(ExecutionStatus.FAILED);
        }

        executionRepository.save(execution);
    }

    private void notifyExecutionManagerCompleted(String executionCode) {
        try {
            String url = executionManagerUrl + "/em/executions/" + executionCode + "/completed";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(5))
                    .build();

            httpClient.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                    .thenAccept(res -> log.info("Notified Execution Manager of completion for job: {}. Status code: {}",
                            executionCode, res.statusCode()))
                    .exceptionally(ex -> {
                        log.error("Failed to notify Execution Manager for execution: {}", executionCode, ex);
                        return null;
                    });
        } catch (Exception e) {
            log.error("Exception notifying Execution Manager for execution: {}", executionCode, e);
        }
    }

    private boolean isTerminal(ExecutionStatus status) {
        return status == ExecutionStatus.PASSED || status == ExecutionStatus.FAILED
                || status == ExecutionStatus.PARTIAL || status == ExecutionStatus.CANCELLED
                || status == ExecutionStatus.COMPLETED || status == ExecutionStatus.ERROR;
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
            log.error("Failed to write execution log to DB", e);
        }
    }
}
