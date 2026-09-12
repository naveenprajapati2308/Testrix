package com.automationportal.apitesting.scheduling;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * One queued execution of a schedule. The poller writes these and returns; the
 * executor drains them. Keeping the backlog in a table rather than an in-memory
 * pool queue is what makes queue depth reportable and survives a restart.
 */
@Data
@Entity
@Table(name = "API_SCHEDULE_JOB")
public class ScheduleJob {

    public enum Status { PENDING, RUNNING, DONE, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "schedule_id", nullable = false)
    private Long scheduleId;

    @Column(name = "project_id")
    private Long projectId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.PENDING;

    @Column(nullable = false)
    private int attempt = 0;

    @Column(name = "claimed_by", length = 100)
    private String claimedBy;

    @Column(name = "enqueued_at", nullable = false)
    private Instant enqueuedAt = Instant.now();

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
}
