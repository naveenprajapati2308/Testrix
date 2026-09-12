package com.testrix.platform.security;

import com.testrix.platform.audit.AuditAction;
import com.testrix.platform.audit.AuditService;
import com.testrix.platform.auth.AuthenticatedUserService;
import com.testrix.platform.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Lets a Super Admin see and lift the temporary sign-in holds without restarting the service.
 * Under /api/admin/** so SecurityConfig's SUPER_ADMIN rule already gates it, and deliberately not
 * in AuthRateLimitFilter's own limited-paths list — an admin clearing holds must never be able to
 * throttle themselves out of doing it.
 */
@RestController
@RequestMapping("/api/admin/rate-limit")
public class RateLimitAdminController {

    private final RateLimiter rateLimiter;
    private final AuthenticatedUserService authenticatedUserService;
    private final AuditService auditService;

    public RateLimitAdminController(RateLimiter rateLimiter,
                                    AuthenticatedUserService authenticatedUserService,
                                    AuditService auditService) {
        this.rateLimiter = rateLimiter;
        this.authenticatedUserService = authenticatedUserService;
        this.auditService = auditService;
    }

    public record HoldView(String scope, String value, long retryAfterSeconds, String retryAfter) {}

    public record ClearRequest(String scope, String value) {}

    @GetMapping("/holds")
    public ApiResponse<List<HoldView>> holds() {
        return ApiResponse.ok(rateLimiter.activeHolds().stream()
                .map(h -> new HoldView(h.scope(), h.value(), h.retryAfterSeconds(),
                        RateLimiter.humanDuration(h.retryAfterSeconds())))
                .toList());
    }

    /** Lifts one hold. scope ACCOUNT takes the username/email, DEVICE takes the IP. */
    @PostMapping("/clear")
    public ApiResponse<Void> clear(@RequestBody ClearRequest request, HttpServletRequest servletRequest) {
        if (request.value() == null || request.value().isBlank()) {
            throw new IllegalArgumentException("value is required");
        }
        boolean device = "DEVICE".equalsIgnoreCase(request.scope());
        String value = request.value().trim();
        rateLimiter.reset((device ? "ip:" : "account:") + (device ? value : value.toLowerCase()));
        auditService.record(authenticatedUserService.currentUser(), AuditAction.RATE_LIMIT_CLEARED,
                "Cleared sign-in hold for " + (device ? "device " : "account ") + value, servletRequest);
        return ApiResponse.ok(null);
    }

    @PostMapping("/clear-all")
    public ApiResponse<Void> clearAll(HttpServletRequest servletRequest) {
        int cleared = rateLimiter.clearAll();
        auditService.record(authenticatedUserService.currentUser(), AuditAction.RATE_LIMIT_CLEARED,
                "Cleared all sign-in holds (" + cleared + " active)", servletRequest);
        return ApiResponse.ok(null);
    }
}
