
ALTER TABLE business_validation_run ADD COLUMN execution_history_id BIGINT NULL;
ALTER TABLE business_validation_run ADD KEY idx_bvr_execution_history (execution_history_id);


ALTER TABLE BASE_API_MASTER ADD COLUMN required_payload_fields LONGTEXT NULL;
ALTER TABLE API_MASTER ADD COLUMN required_payload_fields_template LONGTEXT NULL;
