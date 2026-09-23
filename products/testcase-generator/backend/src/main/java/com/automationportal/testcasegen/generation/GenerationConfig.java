package com.automationportal.testcasegen.generation;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class GenerationConfig {

    /** One task per uploaded document. Kept small: each task fans out to the chunk pool below,
     *  so running many documents at once would multiply AI concurrency past the quota. */
    @Bean("generationExecutor")
    public TaskExecutor generationExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("testgen-doc-");
        executor.initialize();
        return executor;
    }

    /** Shared across all in-flight documents so this is the single ceiling on concurrent Gemini
     *  calls, whatever the upload rate. */
    @Bean(destroyMethod = "shutdown")
    public ExecutorService geminiChunkExecutor(@Value("${testgen.gemini.concurrency}") int concurrency) {
        return Executors.newFixedThreadPool(Math.max(1, concurrency), runnable -> {
            Thread thread = new Thread(runnable);
            thread.setName("testgen-chunk-" + thread.getId());
            thread.setDaemon(true);
            return thread;
        });
    }
}
