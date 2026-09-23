package com.automationportal.testcasegen.testcase;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Every finder takes projectId first. There is deliberately no unscoped finder (no
 * findByDocumentId) — adding one is how cross-project data leaks get introduced.
 */
@Repository
public interface TestCaseRepository extends JpaRepository<TestCase, Long> {

    List<TestCase> findByProjectIdOrderByDisplayOrderAsc(Long projectId);

    List<TestCase> findByProjectIdAndSrsDocumentIdOrderByDisplayOrderAsc(Long projectId, Long srsDocumentId);

    long countByProjectIdAndSrsDocumentId(Long projectId, Long srsDocumentId);

    long countByProjectId(Long projectId);

    long countByProjectIdAndReviewStatus(Long projectId, ReviewStatus reviewStatus);

    @Query("SELECT COALESCE(MAX(t.displayOrder), 0) FROM TestCase t "
            + "WHERE t.projectId = :projectId AND t.srsDocumentId = :srsDocumentId")
    int maxDisplayOrder(@Param("projectId") Long projectId, @Param("srsDocumentId") Long srsDocumentId);
}
