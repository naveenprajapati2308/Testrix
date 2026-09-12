package com.testrix.platform.common;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EntityIdGeneratorService {
    private final JdbcTemplate jdbcTemplate;

    public EntityIdGeneratorService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String next(String prefix) {
        String p = prefix.trim().toUpperCase();

        // Issues the row's *current* next_value (via LAST_INSERT_ID(...) referencing
        // the
        // pre-update value on the right-hand side — same idiom
        // ExecutionIdGeneratorService uses)
        // then stores value+1 for the following call. A prefix seen for the first time
        // starts at 1.
        jdbcTemplate.update(
                "INSERT INTO entity_id_sequences (prefix, next_value) VALUES (?, LAST_INSERT_ID(1) + 1) " +
                        "ON DUPLICATE KEY UPDATE next_value = LAST_INSERT_ID(next_value) + 1",
                p);
        long value = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        return String.format("%s-%06d", p, value);
    }
}
