package com.automationportal.testcasegen.generation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Repository
public interface AiTestGenerationRunRepository extends JpaRepository<AiTestGenerationRun, Long> {

    Optional<AiTestGenerationRun> findTopBySrsDocumentIdOrderByIdDesc(Long srsDocumentId);

    /** Written from the chunk worker threads as each chunk finishes, so the UI's progress bar
     *  reflects real work done. Targeted update rather than a full entity save: several threads
     *  report progress concurrently and must not overwrite each other's other fields. */
    @Modifying
    @Transactional
    @Query("UPDATE AiTestGenerationRun r SET r.processedChunks = :processed WHERE r.id = :id")
    void updateProgress(@Param("id") Long id, @Param("processed") int processed);
}
