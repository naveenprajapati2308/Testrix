package com.automationportal.apitesting.scheduling;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "apitesting.scheduler")
public class SchedulerProperties {

    private long pollIntervalMs = 15000;
    private int claimBatchSize = 200;
    private int maxConcurrentExecutions = 20;
    private int lockLeaseSeconds = 60;
    private int defaultMaxRetries = 3;
    private String instanceId = "local";

    /**
     * Hand due schedules to a durable queue table (API_SCHEDULE_JOB) instead of
     * straight to the in-memory pool. The poller then only ever writes a row and
     * returns, which is what makes the backlog visible (queue depth / position) and
     * lets it survive a restart. Off means the poller executes inline exactly as before.
     */
    private boolean queueEnabled = true;

    /**
     * Lets one instance write queue rows without also draining them, and another
     * drain without also polling for due schedules — so a REST-facing instance can
     * hand scheduled execution off to a dedicated, independently scalable fleet
     * while still running "Run Now" itself. Both default true, which is today's
     * single-instance behaviour: one process does everything. Only meaningful when
     * queueEnabled is also true.
     */
    private boolean pollerEnabled = true;
    private boolean drainEnabled = true;

    /** How often the drain loop looks for queued work. */
    private long queuePollIntervalMs = 5000;

    /** How long finished queue rows are kept before being purged. */
    private int queueRetentionDays = 7;

    /**
     * Hard cap on how many schedules one project may have. Counts every schedule the
     * project owns, paused ones included — otherwise pausing would free a slot and the
     * cap could be walked straight past. 0 or less means no limit.
     */
    private int maxSchedulesPerProject = 100;

    /**
     * Round-robin the claim batch across projects instead of taking it strictly in
     * due-time order. Without this, one project with more due schedules than the
     * batch size fills every batch and no other project's work is ever reached.
     * A single-project deployment is unaffected — round-robin over one group is
     * the same as taking them in order.
     */
    private boolean fairClaimEnabled = true;

    /**
     * How many times {@link #claimBatchSize} to scan for candidates before
     * round-robining them. Claiming looks at this many rows so that projects
     * queued behind a large one are still visible; only claimBatchSize are
     * actually taken.
     */
    private int claimCandidateMultiplier = 5;

    /**
     * Spreads schedules that would otherwise all fire on the same boundary (the
     * classic "everyone picks midnight" pile-up) over this many seconds, using a
     * fixed per-schedule offset so a given schedule keeps the same slot every run.
     * Default 0 keeps the current exact-anchor behaviour — turn it on when the
     * herd is real, since it deliberately trades exact firing time for smooth load.
     */
    private int jitterSeconds = 0;
}
