package com.automationportal.apitesting.scheduling;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Drains the schedule queue — the executor half of the split, and the direct
 * counterpart of performance-testing's PerfJobWorker.
 *
 * <p>Dispatch is capped by how many executions are actually in flight rather than by
 * how many rows are waiting, so a backlog of any size drains at a controlled rate
 * instead of arriving all at once. Does nothing at all unless
 * {@code apitesting.scheduler.queue-enabled} is on, in which case the poller is still
 * executing inline and there is nothing here to drain.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ScheduleJobWorker {

    private final ScheduleJobService jobService;
    private final ScheduleWorker worker;
    private final SchedulerProperties properties;
    @Qualifier("scheduleWorkerExecutor")
    private final ThreadPoolTaskExecutor executor;

    private final AtomicInteger inFlight = new AtomicInteger();

    @PostConstruct
    void recoverOwnJobs() {
        if (!properties.isQueueEnabled()) return;
        int requeued = jobService.requeueOwnRunningJobs();
        if (requeued > 0) {
            log.info("Re-queued {} job(s) this instance left RUNNING before restart", requeued);
        }
    }

    @Scheduled(fixedDelayString = "${apitesting.scheduler.queue-poll-interval-ms:5000}", initialDelay = 12_000)
    public void drainQueue() {
        // The REST-facing backend can be configured to only write queue rows (see
        // SchedulePoller) and leave draining/executing to a dedicated, independently
        // scalable execution-service fleet — this is what turns that off here.
        if (!properties.isQueueEnabled() || !properties.isDrainEnabled()) return;
        try {
            jobService.requeueStale();

            int capacity = properties.getMaxConcurrentExecutions() - inFlight.get();
            if (capacity <= 0) return;

            List<ScheduleJob> claimed = jobService.claimPending(capacity);
            for (ScheduleJob job : claimed) {
                inFlight.incrementAndGet();
                try {
                    executor.execute(() -> runJob(job));
                } catch (RejectedExecutionException ex) {
                    // Pool is full even though our own counter said otherwise (a manual
                    // run-now shares this pool). Put it straight back rather than losing it.
                    inFlight.decrementAndGet();
                    jobService.finish(job.getId(), false, "Executor rejected the job; re-queued");
                    log.warn("Executor rejected schedule job {} — will be retried", job.getId());
                }
            }
            if (!claimed.isEmpty()) {
                log.info("Dispatched {} queued schedule job(s); {} in flight", claimed.size(), inFlight.get());
            }
        } catch (Exception ex) {
            log.error("Schedule queue drain failed: {}", ex.getMessage(), ex);
        }
    }

    private void runJob(ScheduleJob job) {
        try {
            worker.run(job.getScheduleId());
            jobService.finish(job.getId(), true, null);
        } catch (Exception ex) {
            log.error("Schedule job {} (schedule {}) failed: {}", job.getId(), job.getScheduleId(), ex.getMessage(), ex);
            jobService.finish(job.getId(), false, ex.getMessage());
        } finally {
            inFlight.decrementAndGet();
        }
    }

    /** Hourly tidy-up so finished rows don't accumulate forever. */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 600_000)
    public void purgeFinished() {
        if (!properties.isQueueEnabled()) return;
        try {
            int purged = jobService.purgeFinished();
            if (purged > 0) log.info("Purged {} finished schedule job row(s)", purged);
        } catch (Exception ex) {
            log.warn("Schedule job purge failed: {}", ex.getMessage());
        }
    }
}
