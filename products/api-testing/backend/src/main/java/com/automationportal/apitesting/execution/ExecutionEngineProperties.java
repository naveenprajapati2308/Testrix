package com.automationportal.apitesting.execution;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Data
@Component
@ConfigurationProperties(prefix = "apitesting.execution")
public class ExecutionEngineProperties {

    /**
     * Hosts that must be executed through the system curl binary rather than the
     * pooled WebClient. Matched on the exact host or any subdomain of it.
     * Everything else uses WebClient, which is both far cheaper (no process per
     * request) and richer (curl returns no response headers and no TTFB).
     */
    private List<String> curlHosts = new ArrayList<>();

    private Pool pool = new Pool();

    @Data
    public static class Pool {
        /** Set false to go back to a fresh connection per request. */
        private boolean enabled = true;
        private int maxConnections = 200;

        /**
         * Must stay below the target server's own keep-alive idle timeout. Pooling
         * was originally disabled outright because a server closing an idle
         * keep-alive connection before the pool noticed left the next request
         * writing to a dead socket, surfacing only after the full response timeout.
         * Evicting our side first is the actual fix for that, rather than giving up
         * connection reuse entirely.
         */
        private int maxIdleSeconds = 20;

        /** Hard ceiling on connection age, so no connection lives long enough to go stale unnoticed. */
        private int maxLifeSeconds = 300;

        /** How often the background evictor sweeps for idle/expired connections. */
        private int evictIntervalSeconds = 30;

        /** How long a request waits for a free connection once maxConnections is reached. */
        private int pendingAcquireTimeoutSeconds = 45;
    }
}
