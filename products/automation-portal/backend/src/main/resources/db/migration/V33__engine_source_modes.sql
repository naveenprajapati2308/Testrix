-- V33: Support for multiple framework execution sources:
-- Mode 1: GIT_REMOTE (Git URL, branch, encrypted PAT/token authentication)
-- Mode 2: LOCAL_AGENT (Distributed agent running on user machine)
-- Mode 3: LOCAL_DEV (Local directory path under PROJECT_FRAMEWORKS_ROOT, default)

ALTER TABLE test_engines
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'LOCAL_DEV',
    ADD COLUMN git_repo_url VARCHAR(500) NULL,
    ADD COLUMN git_branch VARCHAR(100) NULL DEFAULT 'main',
    ADD COLUMN git_auth_type VARCHAR(30) NULL DEFAULT 'NONE',
    ADD COLUMN git_token_encrypted TEXT NULL,
    ADD COLUMN git_username VARCHAR(100) NULL,
    ADD COLUMN local_agent_id VARCHAR(100) NULL,
    ADD COLUMN local_agent_status VARCHAR(30) NULL;

-- Execution Manager's execution_jobs table gets source resolution columns
-- so dispatch to the Framework Runner can carry the remote Git or local agent parameters.
ALTER TABLE execution_jobs
    ADD COLUMN source_type VARCHAR(30) NULL DEFAULT 'LOCAL_DEV',
    ADD COLUMN git_repo_url VARCHAR(500) NULL,
    ADD COLUMN git_branch VARCHAR(100) NULL,
    ADD COLUMN git_auth_type VARCHAR(30) NULL,
    ADD COLUMN git_token_encrypted TEXT NULL,
    ADD COLUMN git_username VARCHAR(100) NULL,
    ADD COLUMN local_agent_id VARCHAR(100) NULL;
