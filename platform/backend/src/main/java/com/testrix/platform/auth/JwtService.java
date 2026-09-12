package com.testrix.platform.auth;

import com.testrix.platform.users.User;
import com.testrix.platform.workspace.ProjectContext;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class JwtService {
    private final SecretKey key;
    private final long expirationMinutes;

    public JwtService(@Value("${portal.jwt.secret}") String secret,
                      @Value("${portal.jwt.expiration-minutes}") long expirationMinutes) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMinutes = expirationMinutes;
    }

    /** No project claims — used for Super Admin (never inside a project) and for a user who
     * hasn't picked a project yet (multiple memberships, pending selection). */
    public String createAccessToken(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(user.getUsername())
            .claims(Map.of("role", user.getRole().name(), "uid", user.getId(), "email", user.getEmail()))
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(expirationMinutes * 60)))
            .signWith(key)
            .compact();
    }

    /** Same token shape, plus tenant/project/role claims scoping this session to one Project. */
    public String createProjectAccessToken(User user, ProjectContext context) {
        Instant now = Instant.now();
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", user.getRole().name());
        claims.put("uid", user.getId());
        claims.put("email", user.getEmail());
        claims.put("tenantId", String.valueOf(context.tenantId()));
        claims.put("projectId", String.valueOf(context.projectId()));
        claims.put("projectCode", context.projectCode());
        claims.put("projectRoles", context.projectRoles());
        return Jwts.builder()
            .subject(user.getUsername())
            .claims(claims)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(expirationMinutes * 60)))
            .signWith(key)
            .compact();
    }

    public String username(String token) {
        return claims(token).getSubject();
    }

    public Claims claims(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    /** Null if the token carries no project claim (Super Admin, or pending project selection). */
    public ProjectContext projectContext(String token) {
        return projectContextFromClaims(claims(token));
    }

    @SuppressWarnings("unchecked")
    public ProjectContext projectContextFromClaims(Claims claims) {
        String projectId = claims.get("projectId", String.class);
        if (projectId == null) return null;
        String tenantId = claims.get("tenantId", String.class);
        String projectCode = claims.get("projectCode", String.class);
        List<String> roles = claims.get("projectRoles", List.class);
        return new ProjectContext(Long.valueOf(tenantId), Long.valueOf(projectId), projectCode,
            roles == null ? List.of() : roles);
    }
}
