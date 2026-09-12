package com.testrix.platform.audit;

import java.time.Instant;

public record AuditLogDto(Long id, String username, AuditAction action, String details, String ipAddress, Instant createdAt) {
    public static AuditLogDto from(AuditLog log) {
        return new AuditLogDto(log.getId(), log.getUsername(), log.getAction(), log.getDetails(), log.getIpAddress(), log.getCreatedAt());
    }
}
