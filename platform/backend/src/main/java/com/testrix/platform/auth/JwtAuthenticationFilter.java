package com.testrix.platform.auth;

import com.testrix.platform.users.User;
import com.testrix.platform.users.UserRepository;
import com.testrix.platform.users.UserStatus;
import com.testrix.platform.workspace.ProjectContext;
import com.testrix.platform.workspace.ProjectContextHolder;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Set;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
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
                var claims = jwtService.claims(token);
                String username = claims.getSubject();
                User user = userRepository.findByUsername(username).orElse(null);
                if (user != null && user.getStatus() == UserStatus.ACTIVE && user.isEmailVerified()) {
                    var auth = new UsernamePasswordAuthenticationToken(
                        user,
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
                    );
                    SecurityContextHolder.getContext().setAuthentication(auth);
                    ProjectContextHolder.set(jwtService.projectContextFromClaims(claims));
                }
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

    private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final Set<String> VIEWER_EXEMPT_PREFIXES = Set.of("/api/auth", "/api/profile");

    // docs/version2.2.md: Viewer is strictly read-only (no Execute/Create/Edit/Delete/Configure/
    // Schedule/Manage users), enforced here at the one point every project-scoped request already
    // passes through, rather than duplicated per-controller. Self-service identity endpoints
    // (login/logout, own profile) stay reachable — those aren't project data.
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
