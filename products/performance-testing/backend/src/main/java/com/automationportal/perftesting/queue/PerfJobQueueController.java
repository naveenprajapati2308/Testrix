package com.automationportal.perftesting.queue;

import com.automationportal.perftesting.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST API for queue observability and management.
 *
 * <pre>
 *   GET    /api/v1/queue/status       - Live summary (pending, running, failed, cap)
 *   GET    /api/v1/queue/jobs         - Recent 50 jobs (newest first)
 *   DELETE /api/v1/queue/jobs/{id}    - Cancel a PENDING job
 * </pre>
 */
@RestController
@RequestMapping("/api/v1/queue")
@RequiredArgsConstructor
public class PerfJobQueueController {

    private final PerfJobQueueRepository repository;
    private final PerfJobQueueService service;

    @Value("${perf.queue.max-concurrent-runs:3}")
    private int maxConcurrentRuns;

    /**
     * Returns a live snapshot of the queue state.
     * The frontend Scheduler page polls this every 10 seconds.
     */
    @GetMapping("/status")
    public ApiResponse<QueueStatusDto> getStatus() {
        long pending   = repository.countByStatus(JobStatus.PENDING);
        long running   = repository.countByStatus(JobStatus.RUNNING);
        long failed    = repository.countByStatus(JobStatus.FAILED);
        long completed = repository.countByStatus(JobStatus.COMPLETED);

        return ApiResponse.ok(QueueStatusDto.builder()
                .pendingCount(pending)
                .runningCount(running)
                .failedCount(failed)
                .completedCount(completed)
                .maxConcurrentRuns(maxConcurrentRuns)
                .isAtCapacity(running >= maxConcurrentRuns)
                .build());
    }

    /**
     * Returns the 50 most recently enqueued jobs (newest first).
     */
    @GetMapping("/jobs")
    public ApiResponse<List<PerfJobQueue>> getRecentJobs() {
        return ApiResponse.ok(repository.findTop50ByOrderByEnqueuedAtDesc());
    }

    /**
     * Cancels a PENDING job by ID.
     * Only PENDING jobs can be cancelled; RUNNING jobs must be aborted at the run level.
     */
    @DeleteMapping("/jobs/{id}")
    public ApiResponse<Void> cancelJob(@PathVariable Long id) {
        service.cancel(id);
        return ApiResponse.ok(null);
    }
}
