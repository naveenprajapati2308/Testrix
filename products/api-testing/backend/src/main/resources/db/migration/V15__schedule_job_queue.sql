-- Durable queue between the schedule poller and the executor, mirroring
-- performance-testing's perf_job_queue. Until now a due schedule went straight onto
-- an in-memory thread pool, so the backlog was invisible (no way to tell a user where
-- they are in line) and anything still queued was lost on restart.
--
-- Purely additive: no existing table is touched, and the poller only writes here when
-- apitesting.scheduler.queue-enabled is on.
CREATE TABLE API_SCHEDULE_JOB (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    schedule_id   BIGINT       NOT NULL,
    project_id    BIGINT       NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    attempt       INT          NOT NULL DEFAULT 0,
    claimed_by    VARCHAR(100) NULL,
    enqueued_at   DATETIME(6)  NOT NULL,
    started_at    DATETIME(6)  NULL,
    finished_at   DATETIME(6)  NULL,
    error_message TEXT         NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_schedule_job_schedule FOREIGN KEY (schedule_id)
        REFERENCES API_SCHEDULE (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Drives the drain loop: oldest PENDING first.
CREATE INDEX idx_schedule_job_status_enqueued ON API_SCHEDULE_JOB (status, enqueued_at);

-- Lets the claim query cheaply skip schedules that already have work in flight, which
-- is what stops the poller re-enqueueing the same schedule on every tick while it waits.
CREATE INDEX idx_schedule_job_schedule_status ON API_SCHEDULE_JOB (schedule_id, status);

-- Per-project queue depth, for the "you are number N in line" view.
CREATE INDEX idx_schedule_job_project_status ON API_SCHEDULE_JOB (project_id, status);
