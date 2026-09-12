package com.testrix.platform.audit;

import com.testrix.platform.common.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Super Admin's platform-wide activity feed (Admin Dashboard's "Recent Platform Activity").
 * Already covered by SecurityConfig's blanket /api/admin/** -> hasRole("SUPER_ADMIN") rule.
 */
@RestController
@RequestMapping("/api/admin/audit-logs")
public class AdminAuditLogController {
    private final AuditLogRepository repository;

    public AdminAuditLogController(AuditLogRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ApiResponse<List<AuditLogDto>> recent() {
        return ApiResponse.ok(repository.findTop20ByOrderByCreatedAtDesc().stream().map(AuditLogDto::from).toList());
    }
}
