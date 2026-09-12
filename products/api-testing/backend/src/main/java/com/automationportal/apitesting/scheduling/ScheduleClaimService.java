package com.automationportal.apitesting.scheduling;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Claims due schedules in one short transaction (pessimistic locks + SKIP
 * LOCKED). Separate bean so the poller's call goes through the Spring proxy.
 */
@Service
@RequiredArgsConstructor
public class ScheduleClaimService {

    private final ScheduleRepository repository;
    private final SchedulerProperties properties;

    @Transactional
    public List<Long> claimDueSchedules() {
        Instant now = Instant.now();
        int batch = properties.getClaimBatchSize();
        int scanSize = properties.isFairClaimEnabled()
                ? batch * Math.max(1, properties.getClaimCandidateMultiplier())
                : batch;

        List<Schedule> candidates = repository.findDueForClaim(Schedule.Status.ACTIVE, now,
                PageRequest.of(0, scanSize));
        List<Schedule> due = properties.isFairClaimEnabled()
                ? shareAcrossProjects(candidates, batch)
                : candidates;

        Instant lease = now.plus(Duration.ofSeconds(properties.getLockLeaseSeconds()));
        for (Schedule s : due) {
            s.setLockedBy(properties.getInstanceId());
            s.setLockedUntil(lease);
        }
        repository.saveAll(due);
        return due.stream().map(Schedule::getId).toList();
    }

    /**
     * Takes one schedule per project in turn until the batch is full, so a project
     * with thousands of due schedules can no longer crowd every other project out
     * of the batch. Candidates arrive in due-time order, so each project's own
     * schedules still run oldest-first. Rows scanned but not taken are simply left
     * for a later tick — their lock is released when this transaction commits.
     */
    private List<Schedule> shareAcrossProjects(List<Schedule> candidates, int batch) {
        Map<Long, Deque<Schedule>> byProject = new LinkedHashMap<>();
        for (Schedule s : candidates) {
            byProject.computeIfAbsent(s.getProjectId(), k -> new ArrayDeque<>()).add(s);
        }
        List<Schedule> picked = new ArrayList<>(Math.min(batch, candidates.size()));
        while (picked.size() < batch && !byProject.isEmpty()) {
            Iterator<Deque<Schedule>> queues = byProject.values().iterator();
            while (queues.hasNext() && picked.size() < batch) {
                Deque<Schedule> queue = queues.next();
                picked.add(queue.poll());
                if (queue.isEmpty()) queues.remove();
            }
        }
        return picked;
    }

    /** Pushes the lease forward for work this instance still holds — see ScheduleRepository.extendLease. */
    @Transactional
    public int renewLeases(Collection<Long> scheduleIds) {
        if (scheduleIds.isEmpty()) return 0;
        Instant lease = Instant.now().plus(Duration.ofSeconds(properties.getLockLeaseSeconds()));
        return repository.extendLease(scheduleIds, lease, properties.getInstanceId());
    }

    /** Hands a claimed-but-not-dispatched schedule back so a later poll can retry it. */
    @Transactional
    public int releaseClaim(Long scheduleId) {
        return repository.releaseClaim(scheduleId, properties.getInstanceId());
    }
}
