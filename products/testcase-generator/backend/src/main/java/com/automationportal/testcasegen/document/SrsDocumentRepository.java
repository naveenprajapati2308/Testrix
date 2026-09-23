package com.automationportal.testcasegen.document;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SrsDocumentRepository extends JpaRepository<SrsDocument, Long> {
    List<SrsDocument> findByProjectIdOrderByCreatedAtDesc(Long projectId);

    long countByProjectId(Long projectId);
}
