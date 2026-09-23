package com.automationportal.testcasegen.dashboard;

import com.automationportal.testcasegen.common.ApiResponse;
import com.automationportal.testcasegen.document.SrsDocumentRepository;
import com.automationportal.testcasegen.security.CurrentProjectService;
import com.automationportal.testcasegen.testcase.ReviewStatus;
import com.automationportal.testcasegen.testcase.TestCaseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Feeds the shell's Global Dashboard tile. Scoped to the caller's project like every other
 *  read here, so the tile never shows another workspace's totals. */
@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final SrsDocumentRepository documentRepository;
    private final TestCaseRepository testCaseRepository;
    private final CurrentProjectService currentProjectService;

    @GetMapping("/summary")
    public ApiResponse<DashboardSummaryDto> summary() {
        Long projectId = currentProjectService.requireProjectId();
        long total = testCaseRepository.countByProjectId(projectId);
        long approved = testCaseRepository.countByProjectIdAndReviewStatus(projectId, ReviewStatus.APPROVED);
        return ApiResponse.ok(new DashboardSummaryDto(
                documentRepository.countByProjectId(projectId),
                total,
                approved,
                total - approved));
    }
}
