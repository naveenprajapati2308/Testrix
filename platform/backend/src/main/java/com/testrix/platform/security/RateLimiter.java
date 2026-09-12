package com.testrix.platform.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Counts attempts per key and, once a limit is passed, holds that key for a fixed period. Nothing
 * is ever blocked permanently — the hold expires on its own and the counter resets with it.
 * In-memory on purpose: a shared store would make login depend on yet another service being up.
 */
@Component
public class RateLimiter {

    private static final class Window {
        private long startedAtEpochSecond;
        private int count;
        private long lockedUntilEpochSecond;
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final boolean enabled;

    public RateLimiter(@Value("${security.rate-limit.enabled:true}") boolean enabled) {
        this.enabled = enabled;
    }

    /**
     * Records one attempt and returns how many seconds the caller must wait, or 0 when allowed.
     * Attempts made while already held do not extend the hold, so a bot hammering the endpoint
     * can never turn a temporary pause into a permanent lockout for a real user.
     */
    public long retryAfterSeconds(String key, int maxAttempts, int windowSeconds, int lockoutSeconds) {
        if (!enabled || maxAttempts <= 0 || key == null || key.isBlank()) return 0;
        long now = Instant.now().getEpochSecond();
        Window window = windows.computeIfAbsent(key, k -> {
            Window w = new Window();
            w.startedAtEpochSecond = now;
            return w;
        });
        synchronized (window) {
            if (window.lockedUntilEpochSecond > now) {
                return window.lockedUntilEpochSecond - now;
            }
            if (window.lockedUntilEpochSecond > 0 || now - window.startedAtEpochSecond >= windowSeconds) {
                window.lockedUntilEpochSecond = 0;
                window.startedAtEpochSecond = now;
                window.count = 0;
            }
            if (++window.count > maxAttempts) {
                window.lockedUntilEpochSecond = now + lockoutSeconds;
                return lockoutSeconds;
            }
            return 0;
        }
    }

    /** Clears a key after a successful login, so a legitimate user who mistyped a few times is
     *  not left waiting. */
    public void reset(String key) {
        if (key != null) windows.remove(key);
    }

    /** One key currently serving a hold. {@code scope} is ACCOUNT or DEVICE; {@code value} is the
     *  username or IP the hold applies to. */
    public record Hold(String scope, String value, long retryAfterSeconds) {}

    /** Only keys actually under a hold — a key that has merely recorded a few attempts is not
     *  interesting to an administrator and would leak every username ever typed at the login box. */
    public List<Hold> activeHolds() {
        long now = Instant.now().getEpochSecond();
        List<Hold> holds = new ArrayList<>();
        windows.forEach((key, window) -> {
            long remaining;
            synchronized (window) {
                remaining = window.lockedUntilEpochSecond - now;
            }
            if (remaining > 0) {
                int split = key.indexOf(':');
                String prefix = split < 0 ? "" : key.substring(0, split);
                holds.add(new Hold("ip".equals(prefix) ? "DEVICE" : "ACCOUNT",
                        split < 0 ? key : key.substring(split + 1), remaining));
            }
        });
        holds.sort(Comparator.comparingLong(Hold::retryAfterSeconds).reversed());
        return holds;
    }

    /** @return how many holds were cleared. */
    public int clearAll() {
        List<Hold> held = activeHolds();
        windows.clear();
        return held.size();
    }

    /** "1 day" / "1 hour" / "25 minutes" — used in the message shown to the caller. */
    public static String humanDuration(long seconds) {
        if (seconds >= 86400) {
            long days = Math.round(seconds / 86400.0);
            return days + (days == 1 ? " day" : " days");
        }
        if (seconds >= 3600) {
            long hours = Math.round(seconds / 3600.0);
            return hours + (hours == 1 ? " hour" : " hours");
        }
        long minutes = Math.max(1, Math.round(seconds / 60.0));
        return minutes + (minutes == 1 ? " minute" : " minutes");
    }

    // Without this the map grows one entry per distinct IP/username seen, forever.
    @Scheduled(fixedDelay = 600_000)
    void evictExpiredWindows() {
        long now = Instant.now().getEpochSecond();
        windows.entrySet().removeIf(e -> {
            Window w = e.getValue();
            synchronized (w) {
                return w.lockedUntilEpochSecond < now && now - w.startedAtEpochSecond > 86_400;
            }
        });
    }
}
