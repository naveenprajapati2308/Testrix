package com.automationportal.em.queue;

import com.automationportal.em.callback.PortalCallbackClient;
import com.automationportal.em.model.ExecutionJob;
import com.automationportal.em.model.RunnerRegistry;
import com.automationportal.em.repository.ExecutionJobRepository;
import com.automationportal.em.repository.RunnerRegistryRepository;
import com.automationportal.em.runner.RunnerClient;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
public class QueueProcessor {
    private static final Logger log = LoggerFactory.getLogger(QueueProcessor.class);

    private final ExecutionJobRepository jobRepository;
    private final RunnerRegistryRepository runnerRepository;
    private final RunnerClient runnerClient;
    private final PortalCallbackClient callbackClient;

    @Value("${em.max-concurrent:1}")
    private int maxConcurrent;

    @Value("${em.timeout-minutes:120}")
    private int timeoutMinutes;

    @Value("${em.runner-url:http://localhost:9090}")
    private String defaultRunnerUrl;

    // Comma-separated list of runner base URLs — a small, statically-defined pool
    // (docker-compose runs a few named automation-framework-runner-N instances) instead of the
    // one hardcoded default. Blank/unset keeps today's single-runner behavior exactly as before
    // (native/local dev without the multi-runner compose group).
    @Value("${em.runner-urls:}")
    private String runnerUrlsCsv;

    @Value("${em.portal-backend-url:http://localhost:8080}")
    private String portalBackendUrl;

    @Value("${em.portal-api-key:shared-secret}")
    private String portalApiKey;

    public QueueProcessor(ExecutionJobRepository jobRepository,
                          RunnerRegistryRepository runnerRepository,
                          RunnerClient runnerClient,
                          PortalCallbackClient callbackClient) {
        this.jobRepository = jobRepository;
        this.runnerRepository = runnerRepository;
        this.runnerClient = runnerClient;
        this.callbackClient = callbackClient;
    }

    /**
     * The registry persists in MySQL across environments, but the correct runner URL(s) differ
     * per environment (docker-compose sets Docker network hostnames; native runs default to
     * localhost). Sync every configured runner's row to this instance's configuration on every
     * boot — including deleting rows for URLs no longer configured — so a stale row from a
     * previous environment or a since-removed runner can never black-hole or double-dispatch.
     */
    @PostConstruct
    void syncRunners() {
        List<String> urls = parseRunnerUrls();
        if (urls.isEmpty()) {
            syncSingleDefaultRunner();
            return;
        }
        Set<String> keepIds = new HashSet<>();
        for (int i = 0; i < urls.size(); i++) {
            String id = "runner-" + (i + 1);
            String url = urls.get(i);
            keepIds.add(id);
            RunnerRegistry runner = runnerRepository.findById(id).orElseGet(() -> {
                RunnerRegistry r = new RunnerRegistry();
                r.setRunnerId(id);
                return r;
            });
            runner.setRunnerName("Runner " + (i + 1));
            runner.setRunnerUrl(url);
            runner.setStatus("IDLE");
            runner.setLastHeartbeat(Instant.now());
            runnerRepository.save(runner);
        }
        for (RunnerRegistry existing : runnerRepository.findAll()) {
            if (!keepIds.contains(existing.getRunnerId())) {
                log.info("Removing stale runner registry entry no longer in em.runner-urls: {}", existing.getRunnerId());
                runnerRepository.deleteById(existing.getRunnerId());
            }
        }
    }

    private void syncSingleDefaultRunner() {
        RunnerRegistry runner = runnerRepository.findById("default-runner").orElseGet(() -> {
            RunnerRegistry r = new RunnerRegistry();
            r.setRunnerId("default-runner");
            r.setRunnerName("Default Runner");
            return r;
        });
        if (!defaultRunnerUrl.equals(runner.getRunnerUrl()) || !"IDLE".equalsIgnoreCase(runner.getStatus())) {
            log.info("Syncing default-runner registry entry: url {} -> {}, status {} -> IDLE",
                     runner.getRunnerUrl(), defaultRunnerUrl, runner.getStatus());
        }
        runner.setRunnerUrl(defaultRunnerUrl);
        runner.setStatus("IDLE");
        runner.setLastHeartbeat(Instant.now());
        runnerRepository.save(runner);
    }

    private List<String> parseRunnerUrls() {
        if (runnerUrlsCsv == null || runnerUrlsCsv.isBlank()) return List.of();
        return Arrays.stream(runnerUrlsCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    @Scheduled(fixedDelay = 5000)
    public void processQueue() {
        try {
            // 1. Process active running jobs and check timeouts
            checkRunningJobsTimeout();

            // 2. Concurrency check
            List<ExecutionJob> runningJobs = jobRepository.findByState("RUNNING");
            int runningCount = runningJobs.size();
            
            if (runningCount >= maxConcurrent) {
                return;
            }

            int availableSlots = maxConcurrent - runningCount;

            // 3. Find next enqueued jobs
            List<ExecutionJob> queuedJobs = jobRepository.findQueuedJobsOrdered();
            if (queuedJobs.isEmpty()) {
                return;
            }

            log.info("Found {} queued jobs. Running: {}/{}. Available slots: {}",
                     queuedJobs.size(), runningCount, maxConcurrent, availableSlots);

            // 4. Dispatch jobs — but never two at once for the same project's framework
            // directory (or, for legacy null-framework-path jobs, the one shared checkout):
            // concurrent runs sharing a working directory would corrupt each other's
            // test-output/test-results cleanup and shared node_modules/target. Jobs with
            // different keys are fully independent and may run in parallel, up to
            // maxConcurrent/available runners — this is what turns one global queue into one
            // queue per project, parallel across projects.
            Set<String> busyKeys = new HashSet<>();
            for (ExecutionJob running : runningJobs) {
                busyKeys.add(dispatchKey(running));
            }
            int dispatched = 0;
            for (ExecutionJob job : queuedJobs) {
                if (dispatched >= availableSlots) break;
                String key = dispatchKey(job);
                if (busyKeys.contains(key)) {
                    continue;
                }
                if (dispatchJob(job)) {
                    busyKeys.add(key);
                    dispatched++;
                }
            }
        } catch (Exception e) {
            log.error("Error in queue processor loop", e);
        }
    }

    private String dispatchKey(ExecutionJob job) {
        String fp = job.getFrameworkPath();
        if (fp != null && !fp.isBlank()) {
            return fp;
        }
        String framework = job.getFramework();
        return "LEGACY_SHARED_" + (framework == null ? "" : framework.toUpperCase());
    }

    private boolean dispatchJob(ExecutionJob job) {
        log.info("Attempting to dispatch job: {} for execution: {}", job.getJobId(), job.getExecutionId());

        // Find an IDLE runner or register the default one if registry is empty
        String runnerUrl = selectRunner(job.getFramework());
        if (runnerUrl == null) {
            log.warn("No idle/capable runner available right now for job: {}", job.getJobId());
            return false;
        }

        // docs/version2.3.md Plan 2 / docs/test-engine-integration-architecture.md §3.5: a job
        // tagged with a registered Test Engine withholds EM's own static global credential —
        // the engine's own environment already holds its own key from the one-time registration
        // handoff, so Testrix never needs to re-transmit a secret at dispatch time. FrameworkRunnerService
        // already treats an empty apiKey as "don't override, let the framework's own config win."
        boolean engineManaged = job.getTestEngineCode() != null && !job.getTestEngineCode().isBlank();
        String apiKeyForDispatch = engineManaged ? "" : portalApiKey;

        // Trigger run on Framework Runner
        boolean success = runnerClient.triggerRun(
                runnerUrl,
                job.getJobId(),
                job.getSuiteXml(),
                portalBackendUrl,
                apiKeyForDispatch,
                job.getEnvConfigJson(),
                job.getFramework(),
                job.getBrowser(),
                job.getTagFilter(),
                job.getFrameworkPath(),
                job.getSourceType(),
                job.getGitRepoUrl(),
                job.getGitBranch(),
                job.getGitAuthType(),
                job.getGitToken(),
                job.getGitUsername(),
                job.getLocalAgentId()
        );

        if (success) {
            job.setState("RUNNING");
            job.setStartedAt(Instant.now());
            job.setAssignedRunner(runnerUrl);
            jobRepository.save(job);

            // Mark runner as BUSY
            updateRunnerStatus(runnerUrl, "BUSY");

            // Notify Portal Backend that execution state is RUNNING
            callbackClient.notifyStateChange(job.getExecutionId(), "RUNNING");
            log.info("Job {} successfully dispatched to runner {}", job.getJobId(), runnerUrl);
            return true;
        } else {
            log.error("Failed to trigger job {} on runner {}", job.getJobId(), runnerUrl);
            // Handle dispatch failures - check retry or mark as ERROR
            handleDispatchFailure(job);
            return false;
        }
    }

    private String selectRunner(String framework) {
        List<RunnerRegistry> runners = runnerRepository.findAll();
        if (runners.isEmpty()) {
            // Registry is empty, register the default configured runner
            RunnerRegistry defaultRunner = new RunnerRegistry();
            defaultRunner.setRunnerId("default-runner");
            defaultRunner.setRunnerName("Default Runner");
            defaultRunner.setRunnerUrl(defaultRunnerUrl);
            defaultRunner.setStatus("IDLE");
            defaultRunner.setLastHeartbeat(Instant.now());
            runnerRepository.save(defaultRunner);
            return defaultRunnerUrl;
        }

        List<RunnerRegistry> capable = runners.stream()
                .filter(r -> supportsFramework(r, framework))
                .toList();
        if (capable.isEmpty()) {
            // No runner explicitly declares support for this framework — fall back to the
            // full list rather than refuse dispatch, since today's single shared runner
            // handles every framework and rarely declares supportedFrameworks explicitly.
            capable = runners;
        }

        // Find first runner which is IDLE
        for (RunnerRegistry r : capable) {
            if ("IDLE".equalsIgnoreCase(r.getStatus())) {
                return r.getRunnerUrl();
            }
        }

        // No capable runner is IDLE — with only one static runner and maxConcurrent=1 this branch
        // was previously unreachable (the outer concurrency guard already blocked before we got
        // here), so blindly returning defaultRunnerUrl was harmless. With a multi-runner pool and
        // maxConcurrent > 1 it is NOT harmless: it would fire a second job at an already-BUSY,
        // single-job-capacity runner instance and corrupt that runner's in-flight job tracking.
        // Returning null lets the caller skip dispatch this tick and retry on the next 5s poll.
        return null;
    }

    // null/empty supportedFrameworks = this runner handles everything (today's default, and
    // the only case that exists in practice until a second, specialized runner is registered).
    private boolean supportsFramework(RunnerRegistry runner, String framework) {
        String csv = runner.getSupportedFrameworks();
        if (csv == null || csv.isBlank() || framework == null) return true;
        for (String code : csv.split(",")) {
            if (code.trim().equalsIgnoreCase(framework)) return true;
        }
        return false;
    }

    private void updateRunnerStatus(String url, String status) {
        List<RunnerRegistry> runners = runnerRepository.findAll();
        for (RunnerRegistry r : runners) {
            if (r.getRunnerUrl().equals(url)) {
                r.setStatus(status);
                r.setLastHeartbeat(Instant.now());
                runnerRepository.save(r);
                break;
            }
        }
    }

    private void handleDispatchFailure(ExecutionJob job) {
        int max = job.getMaxRetries();
        int current = job.getRetryCount();
        if (current < max) {
            job.setRetryCount(current + 1);
            job.setState("QUEUED"); // Keep enqueued
            jobRepository.save(job);
            log.info("Retrying job dispatch: {} (attempt {}/{})", job.getJobId(), job.getRetryCount(), max);
        } else {
            job.setState("ERROR");
            job.setCompletedAt(Instant.now());
            jobRepository.save(job);
            callbackClient.notifyStateChange(job.getExecutionId(), "ERROR");
        }
    }

    private void checkRunningJobsTimeout() {
        List<ExecutionJob> runningJobs = jobRepository.findByState("RUNNING");
        for (ExecutionJob job : runningJobs) {
            if (job.getStartedAt() != null) {
                long minutesElapsed = Duration.between(job.getStartedAt(), Instant.now()).toMinutes();
                if (minutesElapsed >= job.getTimeoutMinutes()) {
                    log.warn("Job {} exceeded timeout of {} minutes. Force-terminating...", 
                             job.getJobId(), job.getTimeoutMinutes());
                    
                    // Terminate process on runner
                    if (job.getAssignedRunner() != null) {
                        runnerClient.triggerCancel(job.getAssignedRunner(), job.getJobId());
                        updateRunnerStatus(job.getAssignedRunner(), "IDLE");
                    }
                    
                    job.setState("ERROR");
                    job.setCompletedAt(Instant.now());
                    jobRepository.save(job);
                    
                    // Notify Portal Backend
                    callbackClient.notifyStateChange(job.getExecutionId(), "ERROR");
                }
            }
        }
    }
}
