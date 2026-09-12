package com.automationportal.apitesting.scheduling;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface ScheduleJobRepository extends JpaRepository<ScheduleJob, Long> {

    /**
     * Drain query — same SKIP LOCKED shape the schedule claim uses, so two drain
     * loops can never take the same job.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            SELECT j FROM ScheduleJob j
            WHERE j.status = com.automationportal.apitesting.scheduling.ScheduleJob$Status.PENDING
            ORDER BY j.enqueuedAt
            """)
    List<ScheduleJob> findPendingForClaim(Pageable pageable);

    /** Schedules already queued or running — the poller skips these so it can't enqueue twice. */
    @Query("""
            SELECT j.scheduleId FROM ScheduleJob j
            WHERE j.status IN (com.automationportal.apitesting.scheduling.ScheduleJob$Status.PENDING,
                               com.automationportal.apitesting.scheduling.ScheduleJob$Status.RUNNING)
            """)
    List<Long> findScheduleIdsInFlight();

    long countByStatus(ScheduleJob.Status status);

    long countByProjectIdAndStatus(Long projectId, ScheduleJob.Status status);

    /** Position in line: how many pending jobs were enqueued before this one. */
    long countByStatusAndEnqueuedAtLessThan(ScheduleJob.Status status, Instant enqueuedAt);

    List<ScheduleJob> findByStatusAndStartedAtBefore(ScheduleJob.Status status, Instant cutoff);

    List<ScheduleJob> findTop20ByProjectIdOrderByIdDesc(Long projectId);

    /**
     * Crash recovery, run once at startup: a job left RUNNING by a process that died
     * would otherwise sit there forever holding a slot.
     */
    @Modifying
    @Query("""
            UPDATE ScheduleJob j
            SET j.status = com.automationportal.apitesting.scheduling.ScheduleJob$Status.PENDING,
                j.claimedBy = null, j.startedAt = null
            WHERE j.status = com.automationportal.apitesting.scheduling.ScheduleJob$Status.RUNNING
              AND j.claimedBy = :instanceId
            """)
    int requeueOwnRunningJobs(@Param("instanceId") String instanceId);

    @Modifying
    @Query("DELETE FROM ScheduleJob j WHERE j.status IN (com.automationportal.apitesting.scheduling.ScheduleJob$Status.DONE, com.automationportal.apitesting.scheduling.ScheduleJob$Status.FAILED) AND j.finishedAt < :cutoff")
    int deleteFinishedBefore(@Param("cutoff") Instant cutoff);
}
