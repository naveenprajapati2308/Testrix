package com.automationportal.perftesting.schedule;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PerfTestScheduleRepository extends JpaRepository<PerfTestSchedule, Long> {

    List<PerfTestSchedule> findByIsEnabled(boolean isEnabled);

    long countByIsEnabled(boolean isEnabled);

    List<PerfTestSchedule> findByTargetTypeAndTargetId(ScheduleTargetType targetType, Long targetId);

    List<PerfTestSchedule> findByProjectId(Long projectId);

    long countByProjectId(Long projectId);

    long countByProjectIdAndIsEnabled(Long projectId, boolean isEnabled);

    /**
     * Plain, unlocked scan of due candidates — feeds ScheduledRunner's per-project
     * fair-share selection. Not itself a claim: the actual SKIP LOCKED claim happens
     * per selected id in claimScheduleById, so a row another instance already claimed
     * simply comes back empty there and is skipped, whether or not it showed up here.
     */
    @Query("""
            SELECT s FROM PerfTestSchedule s
            WHERE s.isEnabled = true
              AND (s.nextRunAt IS NULL OR s.nextRunAt <= :now)
            ORDER BY s.nextRunAt
            """)
    List<PerfTestSchedule> findDueCandidates(@Param("now") LocalDateTime now, Pageable pageable);

    @Query(value = "SELECT * FROM perf_test_schedule " +
           "WHERE id = :id AND is_enabled = true AND (next_run_at IS NULL OR next_run_at <= :now) " +
           "FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<PerfTestSchedule> claimScheduleById(@Param("id") Long id, @Param("now") LocalDateTime now);
}
