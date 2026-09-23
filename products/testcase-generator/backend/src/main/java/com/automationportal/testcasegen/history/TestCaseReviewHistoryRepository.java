package com.automationportal.testcasegen.history;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TestCaseReviewHistoryRepository extends JpaRepository<TestCaseReviewHistory, Long> {
    List<TestCaseReviewHistory> findByTestCaseIdOrderByCreatedAtDesc(Long testCaseId);
}
