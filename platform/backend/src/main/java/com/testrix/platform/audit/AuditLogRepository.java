package com.testrix.platform.audit;

import com.testrix.platform.users.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findTop50ByUserOrderByCreatedAtDesc(User user);

    // Platform-wide feed for the Super Admin dashboard's "Recent Platform Activity" — unlike the
    // per-user query above, this is deliberately unscoped (SUPER_ADMIN only, gated by SecurityConfig's
    // blanket /api/admin/** rule).
    List<AuditLog> findTop20ByOrderByCreatedAtDesc();
}
