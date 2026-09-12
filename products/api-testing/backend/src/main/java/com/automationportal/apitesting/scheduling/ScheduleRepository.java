package com.automationportal.apitesting.scheduling;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

    /**
     * Claim query: row-locks due schedules and skips rows another instance has
     * already locked (MySQL 8 SKIP LOCKED via the -2 lock timeout hint), so two
     * pollers can never claim the same schedule.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            SELECT s FROM Schedule s
            WHERE s.status = :status
              AND s.nextRunAt <= :now
              AND (s.lockedUntil IS NULL OR s.lockedUntil < :now)
            ORDER BY s.nextRunAt
            """)
    List<Schedule> findDueForClaim(@Param("status") Schedule.Status status,
                                   @Param("now") Instant now,
                                   org.springframework.data.domain.Pageable pageable);

    /**
     * Run-now lock: conditional update so a manual trigger can never race the
     * poller (or another user) into a double execution. Returns 0 if the row
     * is already locked by a run in progress.
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("""
            UPDATE Schedule s SET s.lockedBy = :by, s.lockedUntil = :until
            WHERE s.id = :id AND (s.lockedUntil IS NULL OR s.lockedUntil < :now)
            """)
    int tryManualLock(@Param("id") Long id, @Param("by") String by,
                      @Param("until") Instant until, @Param("now") Instant now);

    /**
     * Lease heartbeat. The lease is deliberately short so a crashed instance's
     * schedules become re-claimable quickly — but a job that simply takes longer
     * than the lease would otherwise look identical to a crashed one and get
     * re-claimed and run twice. The poller renews the lease on every tick for
     * work it still owns, so "slow" and "dead" stop being indistinguishable.
     * Scoped by lockedBy so it can never extend a lease this instance has
     * already released or that another instance now owns.
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("""
            UPDATE Schedule s SET s.lockedUntil = :until
            WHERE s.id IN :ids AND s.lockedBy = :by
            """)
    int extendLease(@Param("ids") java.util.Collection<Long> ids,
                    @Param("until") Instant until, @Param("by") String by);

    /**
     * Releases a claim without running it, so the next poll can pick it up —
     * used when the worker pool has no room to accept the job.
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("""
            UPDATE Schedule s SET s.lockedBy = null, s.lockedUntil = null
            WHERE s.id = :id AND s.lockedBy = :by
            """)
    int releaseClaim(@Param("id") Long id, @Param("by") String by);

    long countByStatus(Schedule.Status status);

    List<Schedule> findByStatusAndLastRunStatus(Schedule.Status status, Schedule.RunStatus lastRunStatus);

    List<Schedule> findTop10ByStatusOrderByNextRunAtAsc(Schedule.Status status);

    // ── Project-scoped variants for the user-facing ScheduleController/Dashboard. The internal
    // poller (findDueForClaim above) intentionally stays global — it must run every project's
    // due schedules, isolation is an API-boundary concern, not an execution-engine one. ─────────
    List<Schedule> findByProjectId(Long projectId);

    long countByProjectIdAndStatus(Long projectId, Schedule.Status status);

    long countByProjectId(Long projectId);

    List<Schedule> findByProjectIdAndStatusAndLastRunStatus(Long projectId, Schedule.Status status, Schedule.RunStatus lastRunStatus);

    List<Schedule> findTop10ByProjectIdAndStatusOrderByNextRunAtAsc(Long projectId, Schedule.Status status);
}
