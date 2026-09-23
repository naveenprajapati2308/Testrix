package com.automationportal.testcasegen.dashboard;

public record DashboardSummaryDto(
        long totalDocuments,
        long totalTestCases,
        long approved,
        long pendingReview) {
}
