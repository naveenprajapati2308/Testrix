package com.automationportal.apitesting.scheduling;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;

/**
 * Claim-then-dispatch poller. Claiming is a short transaction in
 * ScheduleClaimService (SKIP LOCKED semantics — multiple instances never
 * double-claim); execution happens on the bounded worker pool, never on this
 * thread, so one slow target API cannot stall the loop.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SchedulePoller {

    private final ScheduleClaimService claimService;
    private final ScheduleJobService jobService;
    private final ScheduleWorker worker;
    private final SchedulerProperties properties;
    @Qualifier("scheduleWorkerExecutor")
    private final ThreadPoolTaskExecutor executor;

    /**
     * Everything this instance has accepted but not finished — both queued in the
     * pool and actively running. Their DB lease is renewed on every tick, so a job
     * that outlives the lease is never mistaken for a crashed instance's orphan.
     */
    private final Set<Long> inFlight = ConcurrentHashMap.newKeySet();

    @Scheduled(fixedDelayString = "${apitesting.scheduler.poll-interval-ms}", initialDelay = 10_000)
    public void pollAndDispatch() {
        // A dedicated execution-service instance only drains the queue (see
        // ScheduleJobWorker) — it never scans for or enqueues due schedules itself.
        if (!properties.isPollerEnabled()) return;

        renewInFlightLeases();

        List<Long> claimed = claimService.claimDueSchedules();
        if (properties.isQueueEnabled()) {
            // Queue mode: write the work down and return. The schedule keeps its lease
            // (renewed above from the queue's own in-flight rows) so it can't be claimed
            // again while its job waits, and ScheduleWorker clears it when the run ends.
            jobService.enqueue(claimed);
            if (!claimed.isEmpty()) {
                log.info("Queued {} due schedule(s) as instance '{}'", claimed.size(), properties.getInstanceId());
            }
            return;
        }

        int dispatched = 0;
        for (Long scheduleId : claimed) {
            inFlight.add(scheduleId);
            try {
                executor.execute(() -> {
                    try {
                        worker.run(scheduleId);
                    } finally {
                        inFlight.remove(scheduleId);
                    }
                });
                dispatched++;
            } catch (RejectedExecutionException ex) {
                // Pool and its queue are both full. Hand the claim back rather than
                // running it here — executing on the poller thread would stall the
                // whole loop (and its lease renewals) for that job's full duration.
                inFlight.remove(scheduleId);
                claimService.releaseClaim(scheduleId);
                log.warn("Worker pool saturated — released schedule {} back to the queue for a later poll", scheduleId);
            }
        }
        if (dispatched > 0) {
            log.info("Claimed {} due schedule(s) as instance '{}'", dispatched, properties.getInstanceId());
        }
    }

    private void renewInFlightLeases() {
        try {
            // In queue mode the authority on "still in flight" is the queue table, not this
            // process's memory — the row outlives a restart and may be picked up elsewhere.
            Collection<Long> ids = properties.isQueueEnabled()
                    ? jobService.scheduleIdsInFlight()
                    : Set.copyOf(inFlight);
            if (ids.isEmpty()) return;
            claimService.renewLeases(ids);
        } catch (Exception ex) {
            log.warn("Lease renewal failed: {}", ex.getMessage());
        }
    }
}
