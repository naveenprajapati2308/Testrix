package com.testrix.platform.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Per-IP hold on the endpoints that accept credentials without a token. Without it, login is an
 * unauthenticated, unbounded, password-hashing endpoint — the cheapest target for both credential
 * stuffing and resource-exhaustion.
 *
 * The per-account hold in AuthController is the companion: an IP can be forged by anyone reaching
 * the service directly, a submitted username cannot, so neither check is sufficient alone.
 */
@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(AuthRateLimitFilter.class);

    private static final Set<String> LIMITED_PATHS = Set.of(
            "/api/auth/login",
            "/api/auth/refresh",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/workspace-requests/send-otp",
            "/api/workspace-requests/verify-otp");

    private final RateLimiter rateLimiter;
    private final int maxAttempts;
    private final int windowSeconds;
    private final int lockoutSeconds;

    public AuthRateLimitFilter(RateLimiter rateLimiter,
                               @Value("${security.rate-limit.ip.max-attempts:40}") int maxAttempts,
                               @Value("${security.rate-limit.ip.window-seconds:3600}") int windowSeconds,
                               @Value("${security.rate-limit.ip.lockout-seconds:86400}") int lockoutSeconds) {
        this.rateLimiter = rateLimiter;
        this.maxAttempts = maxAttempts;
        this.windowSeconds = windowSeconds;
        this.lockoutSeconds = lockoutSeconds;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (!"POST".equals(request.getMethod()) || !LIMITED_PATHS.contains(path)) {
            chain.doFilter(request, response);
            return;
        }
        String clientIp = clientIp(request);
        long retryAfter = rateLimiter.retryAfterSeconds("ip:" + clientIp, maxAttempts, windowSeconds, lockoutSeconds);
        if (retryAfter > 0) {
            log.warn("Rate limit hold on {} for {} — {}s remaining", path, clientIp, retryAfter);
            String message = "Too many attempts from this device. For security, access is paused for "
                    + RateLimiter.humanDuration(retryAfter) + ". This is temporary, and your account is not blocked.";
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(retryAfter));
            // Charset matters: this writes the body directly rather than going through Spring's
            // message converter, which would otherwise default to ISO-8859-1 and mangle it.
            response.setContentType("application/json;charset=UTF-8");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"success\":false,\"message\":\"" + message + "\",\"data\":null}");
            return;
        }
        chain.doFilter(request, response);
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
