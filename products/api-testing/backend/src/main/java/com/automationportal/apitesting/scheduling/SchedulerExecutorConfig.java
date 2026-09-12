package com.automationportal.apitesting.scheduling;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ThreadPoolExecutor;

@Configuration
@RequiredArgsConstructor
public class SchedulerExecutorConfig {

    private final SchedulerProperties properties;

    /**
     * Bounded worker pool: due schedules queue and drain at a controlled rate
     * instead of firing simultaneously. Backpressure is applied by refusing the
     * job (AbortPolicy) so SchedulePoller can release the claim and retry it on a
     * later tick — never by CallerRunsPolicy, which would run the job on the
     * poller thread and stall polling (and the lease renewals that depend on it)
     * for that job's entire duration, exactly when the system is busiest.
     */
    @Bean(name = "scheduleWorkerExecutor")
    public ThreadPoolTaskExecutor scheduleWorkerExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.getMaxConcurrentExecutions());
        executor.setMaxPoolSize(properties.getMaxConcurrentExecutions());
        executor.setQueueCapacity(properties.getClaimBatchSize() * 2);
        executor.setThreadNamePrefix("sched-worker-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.initialize();
        return executor;
    }
}
