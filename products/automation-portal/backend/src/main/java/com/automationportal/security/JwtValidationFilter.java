package com.automationportal.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;

/**
 * Validates the signature and expiry of tokens the platform service issued at login, using the
 * shared HMAC secret. There is no user table here, so identity comes entirely from the claims —
 * which is what lets this product keep serving requests while the platform service is down.
 */
@Component
public class JwtValidationFilter extends OncePerRequestFilter {
    private final SecretKey key;

    public JwtValidationFilter(@Value("${portal.jwt.secret}") String secret) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        String token = null;
        if (header != null && header.startsWith("Bearer ")) {
            token = header.substring(7);
        } else if (request.getRequestURI().startsWith(request.getContextPath() + "/api/events/execution/")) {
            // The one legitimate use: EventSource (SSE) can't set request headers, so the
            // live execution log stream passes its token as ?token=... instead. Every other
            // endpoint requires the Authorization header — a query-param token elsewhere would
            // otherwise leak into browser history, proxy logs, and access logs on every request.
            token = request.getParameter("token");
        }
        if (token != null) {
            try {
                Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
                AuthenticatedUser user = userFrom(claims);
                var auth = new UsernamePasswordAuthenticationToken(
                        user, null, List.of(new SimpleGrantedAuthority("ROLE_" + user.role())));
                SecurityContextHolder.getContext().setAuthentication(auth);
                ProjectContextHolder.set(projectContextFrom(claims));
            } catch (JwtException | IllegalArgumentException ignored) {
                SecurityContextHolder.clearContext();
            }
        }
        try {
            if (isViewerOnlyMutation(request, ProjectContextHolder.get())) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"success\":false,\"message\":\"Viewer role is read-only\",\"data\":null}");
                return;
            }
            filterChain.doFilter(request, response);
        } finally {
            ProjectContextHolder.clear();
        }
    }

    private AuthenticatedUser userFrom(Claims claims) {
        Number uid = claims.get("uid", Number.class);
        return new AuthenticatedUser(
                uid == null ? null : uid.longValue(),
                claims.getSubject(),
                claims.get("email", String.class),
                claims.get("role", String.class));
    }

    @SuppressWarnings("unchecked")
    private ProjectContext projectContextFrom(Claims claims) {
        String projectId = claims.get("projectId", String.class);
        if (projectId == null) return null;
        String tenantId = claims.get("tenantId", String.class);
        String projectCode = claims.get("projectCode", String.class);
        List<String> roles = claims.get("projectRoles", List.class);
        return new ProjectContext(Long.valueOf(tenantId), Long.valueOf(projectId), projectCode,
                roles == null ? List.of() : roles);
    }

    private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final Set<String> VIEWER_EXEMPT_PREFIXES = Set.of("/api/auth", "/api/profile");

    // docs/version2.2.md: Viewer is strictly read-only (no Execute/Create/Edit/Delete/Configure/
    // Schedule/Manage users), enforced here at the one point every project-scoped request already
    // passes through, rather than duplicated per-controller.
    private boolean isViewerOnlyMutation(HttpServletRequest request, ProjectContext context) {
        if (context == null || context.projectRoles() == null || context.projectRoles().isEmpty()) return false;
        if (!MUTATING_METHODS.contains(request.getMethod())) return false;
        String path = request.getRequestURI().substring(request.getContextPath().length());
        for (String prefix : VIEWER_EXEMPT_PREFIXES) {
            if (path.startsWith(prefix)) return false;
        }
        return context.projectRoles().stream().allMatch("VIEWER"::equals);
    }
}
