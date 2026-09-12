package com.automationportal.perftesting.schedule;

import com.automationportal.perftesting.queue.JobType;
import com.automationportal.perftesting.queue.PerfJobQueueService;
import com.automationportal.perftesting.results.RunTrigger;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Cron-schedule poller. Wakes up every {@code perf.scheduler.poll-interval-ms}
 * (default 30 s) and claims any due schedule rows using {@code FOR UPDATE SKIP LOCKED}.
 *
 * <h3>Concurrency-safe design</h3>
 * <p>In a multi-instance deployment the DB lock ensures exactly one node claims each
 * schedule row. Once claimed, the runner writes a {@code PENDING} entry to the
 * {@code perf_job_queue} table and returns immediately — <strong>k6 is NOT launched
 * here</strong>. The {@link com.automationportal.perftesting.queue.PerfJobWorker}
 * drains that queue at a configurable concurrency cap, preventing the portal from
 * being overwhelmed when many schedules fire simultaneously.</p>
 *
 * <h3>Fair share across projects</h3>
 * <p>Due candidates are scanned in a batch and, when {@code fair-claim-enabled} is on,
 * taken one project at a time in turn (same shape as API Testing's
 * {@code ScheduleClaimService.shareAcrossProjects}) instead of strictly oldest-due-first
 * — otherwise one project with a large backlog fills every batch and starves the rest.
 * The actual claim is still per-row {@code SKIP LOCKED} ({@link #claimAndEnqueueById}),
 * so this selection is only a fairness hint: a row another instance claims first is
 * simply skipped here, never double-run.</p>
 */
@Component
@RequiredArgsConstructor
public class ScheduledRunner {

    private static final Logger log = LoggerFactory.getLogger(ScheduledRunner.class);

    private final PerfTestScheduleRepository repository;
    private final PerfTestScheduleService service;
    private final PerfJobQueueService jobQueueService;

    @Value("${perf.scheduler.fair-claim-enabled:true}")
    private boolean fairClaimEnabled;

    @Value("${perf.scheduler.claim-batch-size:20}")
    private int claimBatchSize;

    /** How many times claim-batch-size to scan for candidates before round-robining them. */
    @Value("${perf.scheduler.claim-candidate-multiplier:5}")
    private int claimCandidateMultiplier;

    /**
     * Spreads schedules that would otherwise all fire on the same cron boundary (the
     * classic "everyone picks midnight" pile-up) over this many seconds, using a fixed
     * per-schedule offset so a given schedule keeps the same slot every run. 0 keeps
     * today's exact firing time.
     */
    @Value("${perf.scheduler.jitter-seconds:0}")
    private int jitterSeconds;

    /**
     * Wakes up every 30 seconds; drains everything currently due one fair batch at a
     * time, stopping once a batch comes back empty.
     */
    @Scheduled(fixedDelayString = "${perf.scheduler.poll-interval-ms:30000}")
    public void pollAndEnqueue() {
        log.trace("ScheduledRunner checking for due performance tests...");
        List<Long> batch;
        do {
            batch = claimDueBatch();
            for (Long scheduleId : batch) {
                claimAndEnqueueById(scheduleId);
            }
        } while (!batch.isEmpty());
    }

    /** Scans due candidates and returns a fair-shared (or plain oldest-first) batch of ids. */
    private List<Long> claimDueBatch() {
        LocalDateTime now = LocalDateTime.now();
        int scanSize = fairClaimEnabled ? claimBatchSize * Math.max(1, claimCandidateMultiplier) : claimBatchSize;
        List<PerfTestSchedule> candidates = repository.findDueCandidates(now, PageRequest.of(0, scanSize));
        List<PerfTestSchedule> due = fairClaimEnabled ? shareAcrossProjects(candidates, claimBatchSize) : candidates;
        return due.stream().map(PerfTestSchedule::getId).toList();
    }

    /**
     * Takes one schedule per project in turn until the batch is full, so a project with
     * many overdue schedules can no longer crowd every other project out of the batch.
     * Candidates arrive oldest-due-first, so each project's own schedules still run in
     * that order. Rows scanned but not taken are simply left for a later batch/tick.
     */
    private List<PerfTestSchedule> shareAcrossProjects(List<PerfTestSchedule> candidates, int batch) {
        Map<Long, Deque<PerfTestSchedule>> byProject = new LinkedHashMap<>();
        for (PerfTestSchedule s : candidates) {
            byProject.computeIfAbsent(s.getProjectId(), k -> new ArrayDeque<>()).add(s);
        }
        List<PerfTestSchedule> picked = new ArrayList<>(Math.min(batch, candidates.size()));
        while (picked.size() < batch && !byProject.isEmpty()) {
            Iterator<Deque<PerfTestSchedule>> queues = byProject.values().iterator();
            while (queues.hasNext() && picked.size() < batch) {
                Deque<PerfTestSchedule> queue = queues.next();
                picked.add(queue.poll());
                if (queue.isEmpty()) queues.remove();
            }
        }
        return picked;
    }

    /**
     * Claims a single schedule by id and writes a PENDING job to the queue. Uses
     * {@code REQUIRES_NEW} so the database row lock is released as quickly as possible.
     * A schedule already claimed by another instance (or no longer due) simply comes
     * back empty here — safe no-op, not an error.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void claimAndEnqueueById(Long scheduleId) {
        LocalDateTime now = LocalDateTime.now();
        Optional<PerfTestSchedule> claimed = repository.claimScheduleById(scheduleId, now);
        if (claimed.isEmpty()) {
            return;
        }

        PerfTestSchedule schedule = claimed.get();
        log.info("Claimed schedule ID={} targetType={} targetId={}",
                schedule.getId(), schedule.getTargetType(), schedule.getTargetId());

        try {
            JobType jobType = toJobType(schedule.getTargetType());
            if (jobType == null) {
                log.warn("Unsupported schedule target type: {}. Skipping.", schedule.getTargetType());
                schedule.setLastStatus(ScheduleLastStatus.ERROR);
            } else {
                // Enqueue — k6 launch happens later in PerfJobWorker when a slot is free
                jobQueueService.enqueue(jobType, schedule.getTargetId(), RunTrigger.SCHEDULED, schedule.getId());
                schedule.setLastStatus(ScheduleLastStatus.QUEUED);
                log.info("Schedule ID={} enqueued as {} job (target={})",
                        schedule.getId(), jobType, schedule.getTargetId());
            }
        } catch (Exception e) {
            log.error("Failed to enqueue schedule ID={}: {}", schedule.getId(), e.getMessage(), e);
            schedule.setLastStatus(ScheduleLastStatus.ERROR);
        }

        // Update last run timestamp and calculate next execution time
        schedule.setLastRunAt(now);
        LocalDateTime nextRun = applyJitter(schedule, service.calculateNextRun(schedule.getCronExpression(), schedule.getTimezone()));
        schedule.setNextRunAt(nextRun);

        if (nextRun == null) {
            schedule.setIsEnabled(false);
            log.info("No further occurrences for schedule ID={}. Disabling.", schedule.getId());
        }

        repository.save(schedule);
    }

    /**
     * Fixed per-schedule offset inside the jitter window, derived from the id so a
     * schedule keeps the same slot on every run instead of wandering, while many
     * schedules sharing one cron boundary end up spread across the window.
     */
    private LocalDateTime applyJitter(PerfTestSchedule schedule, LocalDateTime base) {
        if (base == null || jitterSeconds <= 0 || schedule.getId() == null) return base;
        return base.plusSeconds(Math.floorMod(schedule.getId() * 2654435761L, jitterSeconds));
    }

    private JobType toJobType(ScheduleTargetType targetType) {
        return switch (targetType) {
            case PERF_TEST  -> JobType.PERF_TEST;
            case LOAD_TEST  -> JobType.LOAD_TEST;
            case GROUP      -> JobType.GROUP;
        };
    }
}
