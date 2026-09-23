-- Test Case Generation: SRS upload -> AI generation -> review/edit -> approval.
--
-- Every top-level table carries project_id: testrix_platform is one shared schema across all
-- Testrix products and a workspace's test cases must never be visible from another workspace.
-- Child tables (steps/preconditions/test data/history) deliberately do NOT carry project_id --
-- they are only ever reached through a parent whose ownership is checked first, the same shape
-- performance-testing uses for perf_metric_sample.
--
-- Distinct from automation-portal's existing test_case_catalog: that is an inventory discovered
-- FROM executions (class/method names). These are authored definitions that exist before any run.

CREATE TABLE srs_documents (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id          BIGINT       NOT NULL,
    file_name           VARCHAR(255) NOT NULL,
    file_type           VARCHAR(50)  NOT NULL,
    file_size           BIGINT       NULL,
    -- Opaque id into the on-disk store; never a client-supplied path, and never served statically.
    storage_id          VARCHAR(100) NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'UPLOADED',
    total_chunks        INT          NOT NULL DEFAULT 0,
    total_test_cases    INT          NOT NULL DEFAULT 0,
    error_message       TEXT         NULL,
    uploaded_by         BIGINT       NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_srs_documents_project FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX idx_srs_documents_project ON srs_documents(project_id);
CREATE INDEX idx_srs_documents_status ON srs_documents(project_id, status);

CREATE TABLE ai_test_generation_runs (
    id                     BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id             BIGINT       NOT NULL,
    srs_document_id        BIGINT       NOT NULL,
    provider               VARCHAR(50)  NOT NULL DEFAULT 'GEMINI',
    model                  VARCHAR(100) NULL,
    status                 VARCHAR(20)  NOT NULL DEFAULT 'STARTED',
    total_chunks           INT          NOT NULL DEFAULT 0,
    -- Drives the real progress bar; the UI polls this rather than faking progress client-side.
    processed_chunks       INT          NOT NULL DEFAULT 0,
    generated_test_cases   INT          NOT NULL DEFAULT 0,
    duplicate_test_cases   INT          NOT NULL DEFAULT 0,
    final_test_cases       INT          NOT NULL DEFAULT 0,
    processing_time_ms     BIGINT       NULL,
    error_message          TEXT         NULL,
    created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at           TIMESTAMP    NULL,
    CONSTRAINT fk_ai_runs_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_ai_runs_document FOREIGN KEY (srs_document_id) REFERENCES srs_documents(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_runs_document ON ai_test_generation_runs(srs_document_id);

CREATE TABLE test_cases (
    id                BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id        BIGINT       NOT NULL,
    -- Kept when the source document is deleted: a heavily-edited test case outlives its origin.
    srs_document_id   BIGINT       NULL,
    test_case_code    VARCHAR(100) NOT NULL,
    -- Position is its own column, never derived from test_case_code -- inserting a row between
    -- two others must not renumber (and invalidate) every code after it. Gapped by 1000.
    display_order     INT          NOT NULL DEFAULT 0,
    title             VARCHAR(500) NOT NULL,
    description       TEXT         NULL,
    test_type         VARCHAR(30)  NOT NULL DEFAULT 'FUNCTIONAL',
    priority          VARCHAR(10)  NULL,
    review_status     VARCHAR(20)  NOT NULL DEFAULT 'AI_GENERATED',
    expected_result   TEXT         NULL,
    source_section    VARCHAR(500) NULL,
    source_text       TEXT         NULL,
    created_by        BIGINT       NULL,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Scoped to the project, not global: two workspaces must both be able to hold a TC-000001.
    CONSTRAINT uq_test_cases_code UNIQUE (project_id, test_case_code),
    CONSTRAINT fk_test_cases_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_test_cases_document FOREIGN KEY (srs_document_id) REFERENCES srs_documents(id) ON DELETE SET NULL
);

CREATE INDEX idx_test_cases_project ON test_cases(project_id);
CREATE INDEX idx_test_cases_document_order ON test_cases(srs_document_id, display_order);
CREATE INDEX idx_test_cases_review_status ON test_cases(project_id, review_status);

CREATE TABLE test_case_steps (
    id               BIGINT PRIMARY KEY AUTO_INCREMENT,
    test_case_id     BIGINT    NOT NULL,
    step_number      INT       NOT NULL,
    action           TEXT      NOT NULL,
    expected_result  TEXT      NULL,
    CONSTRAINT fk_test_case_steps_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_test_case_steps_case ON test_case_steps(test_case_id, step_number);

CREATE TABLE test_case_preconditions (
    id               BIGINT PRIMARY KEY AUTO_INCREMENT,
    test_case_id     BIGINT    NOT NULL,
    sequence_number  INT       NOT NULL DEFAULT 1,
    precondition     TEXT      NOT NULL,
    CONSTRAINT fk_test_case_preconditions_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_test_case_preconditions_case ON test_case_preconditions(test_case_id, sequence_number);

CREATE TABLE test_case_test_data (
    id               BIGINT PRIMARY KEY AUTO_INCREMENT,
    test_case_id     BIGINT    NOT NULL,
    sequence_number  INT       NOT NULL DEFAULT 1,
    data_value       TEXT      NOT NULL,
    CONSTRAINT fk_test_case_test_data_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_test_case_test_data_case ON test_case_test_data(test_case_id, sequence_number);

CREATE TABLE test_case_review_history (
    id            BIGINT PRIMARY KEY AUTO_INCREMENT,
    test_case_id  BIGINT       NOT NULL,
    action        VARCHAR(20)  NOT NULL,
    field_name    VARCHAR(100) NULL,
    old_value     TEXT         NULL,
    new_value     TEXT         NULL,
    changed_by    BIGINT       NULL,
    changed_email VARCHAR(255) NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_test_case_review_history_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE INDEX idx_test_case_review_history_case ON test_case_review_history(test_case_id, created_at);

-- Per-project counter behind TC-000001 codes. Same atomic
-- "INSERT ... ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)" idiom as
-- automation-portal's test_case_id_sequence, so concurrent generations can't collide.
-- Project-wide rather than per-document: a code is a permanent identifier that must stay
-- unique even after its source document is deleted.
CREATE TABLE test_case_code_sequence (
    project_id  BIGINT NOT NULL PRIMARY KEY,
    last_seq    BIGINT NOT NULL DEFAULT 0
);
