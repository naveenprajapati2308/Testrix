package com.automationportal.testcasegen.testcase;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Allocates TC-000001 codes from a per-project counter.
 *
 * Uses the same atomic "INSERT ... ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + n)"
 * idiom as automation-portal's ExecutionIdGeneratorService: the increment and the read of the new
 * value happen in one statement, so two concurrent generations can never be handed the same code.
 */
@Component
public class TestCaseCodeGenerator {

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional
    public String nextCode(Long projectId) {
        return allocate(projectId, 1).get(0);
    }

    /** Reserves a contiguous block in one statement — a generation run inserting 100+ test cases
     *  would otherwise need one round trip per code. */
    @Transactional
    public List<String> nextCodes(Long projectId, int count) {
        return allocate(projectId, count);
    }

    // Both public entry points are annotated and delegate here, so neither relies on a
    // self-invocation that would bypass the transaction proxy — executeUpdate() without an
    // active transaction throws, and the generation worker calls in with none of its own.
    private List<String> allocate(Long projectId, int count) {
        if (count <= 0) return List.of();

        entityManager.createNativeQuery(
                        "INSERT INTO test_case_code_sequence (project_id, last_seq) "
                                + "VALUES (:projectId, LAST_INSERT_ID(:count)) "
                                + "ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + :count)")
                .setParameter("projectId", projectId)
                .setParameter("count", count)
                .executeUpdate();

        Number last = (Number) entityManager.createNativeQuery("SELECT LAST_INSERT_ID()").getSingleResult();
        long end = last.longValue();
        long start = end - count + 1;

        List<String> codes = new ArrayList<>(count);
        for (long seq = start; seq <= end; seq++) {
            codes.add("TC-%06d".formatted(seq));
        }
        return codes;
    }
}
