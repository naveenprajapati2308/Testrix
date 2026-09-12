package com.automationportal.apitesting.scheduling;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Transactional edges of the schedule queue. Separate bean for the same reason
 * ScheduleClaimService is: the poller and the drain loop call these through the
 * Spring proxy, and each call must be its own short transaction so a row lock is
 * never held for the length of an execution.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ScheduleJobService {

    private final ScheduleJobRepository jobRepository;
    private final ScheduleRepository scheduleRepository;
    private final SchedulerProperties properties;

    @Transactional
    public void enqueue(List<Long> scheduleIds) {
        if (scheduleIds.isEmpty()) return;
        Instant now = Instant.now();
        List<ScheduleJob> jobs = scheduleRepository.findAllById(scheduleIds).stream().map(s -> {
            ScheduleJob job = new ScheduleJob();
            job.setScheduleId(s.getId());
            job.setProjectId(s.getProjectId());
            job.setStatus(ScheduleJob.Status.PENDING);
            job.setEnqueuedAt(now);
            return job;
        }).toList();
        jobRepository.saveAll(jobs);
    }

    /** Takes up to {@code limit} pending jobs and marks them RUNNING in one short transaction. */
    @Transactional
    public List<ScheduleJob> claimPending(int limit) {
        if (limit <= 0) return List.of();
        List<ScheduleJob> claimed = jobRepository.findPendingForClaim(PageRequest.of(0, limit));
        Instant now = Instant.now();
        for (ScheduleJob job : claimed) {
            job.setStatus(ScheduleJob.Status.RUNNING);
            job.setClaimedBy(properties.getInstanceId());
            job.setStartedAt(now);
            job.setAttempt(job.getAttempt() + 1);
        }
        jobRepository.saveAll(claimed);
        return claimed;
    }

    @Transactional
    public void finish(Long jobId, boolean ok, String error) {
        jobRepository.findById(jobId).ifPresent(job -> {
            job.setStatus(ok ? ScheduleJob.Status.DONE : ScheduleJob.Status.FAILED);
            job.setFinishedAt(Instant.now());
            job.setErrorMessage(error);
            jobRepository.save(job);
        });
    }

    /** Schedules with work already queued or running — the poller must not enqueue these again. */
    @Transactional(readOnly = true)
    public List<Long> scheduleIdsInFlight() {
        return jobRepository.findScheduleIdsInFlight();
    }

    /**
     * A job whose executor died never reaches a terminal state on its own. Anything
     * RUNNING for longer than a full lease window is treated as abandoned and put back,
     * so a crash costs a retry rather than a permanently occupied slot.
     */
    @Transactional
    public int requeueStale() {
        Instant cutoff = Instant.now().minus(Duration.ofSeconds(Math.max(300, properties.getLockLeaseSeconds() * 5L)));
        List<ScheduleJob> stale = jobRepository.findByStatusAndStartedAtBefore(ScheduleJob.Status.RUNNING, cutoff);
        for (ScheduleJob job : stale) {
            job.setStatus(ScheduleJob.Status.PENDING);
            job.setClaimedBy(null);
            job.setStartedAt(null);
        }
        jobRepository.saveAll(stale);
        if (!stale.isEmpty()) log.warn("Re-queued {} abandoned schedule job(s)", stale.size());
        return stale.size();
    }

    /** Startup recovery for this instance's own jobs, which are definitely not running any more. */
    @Transactional
    public int requeueOwnRunningJobs() {
        return jobRepository.requeueOwnRunningJobs(properties.getInstanceId());
    }

    @Transactional
    public int purgeFinished() {
        return jobRepository.deleteFinishedBefore(
                Instant.now().minus(Duration.ofDays(Math.max(1, properties.getQueueRetentionDays()))));
    }
}
