package com.automationportal.em.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "execution_jobs")
public class ExecutionJob {
    @Id
    @Column(name = "job_id", length = 100)
    private String jobId;

    @Column(name = "execution_id", nullable = false)
    private Long executionId;

    @Column(name = "suite_xml", nullable = false, length = 255)
    private String suiteXml;

    /** Resolved environment config (JSON object of key/values) to inject into the run as -D system properties. */
    @Column(name = "env_config_json", columnDefinition = "TEXT")
    private String envConfigJson;

    /** Which runner engine to dispatch this job to (e.g. MAVEN_TESTNG, PLAYWRIGHT). Free-text so new frameworks don't need a schema change. */
    @Column(name = "framework", nullable = false, length = 50)
    private String framework = "MAVEN_TESTNG";

    /** Pre-execution browser choice (e.g. "chrome"); only meaningful to frameworks whose FrameworkDescriptor declares browsers. */
    @Column(name = "browser", length = 50)
    private String browser;

    /** Optional Playwright --grep pattern (e.g. "@smoke"); null/blank means run the suite unfiltered. */
    @Column(name = "tag_filter", length = 255)
    private String tagFilter;

    @Column(name = "priority", nullable = false, length = 20)
    private String priority = "MEDIUM";

    @Column(name = "state", nullable = false, length = 50)
    private String state = "QUEUED";

    @Column(name = "queue_position", nullable = false)
    private int queuePosition = 0;

    @Column(name = "max_retries", nullable = false)
    private int maxRetries = 0;

    @Column(name = "retry_count", nullable = false)
    private int retryCount = 0;

    @Column(name = "timeout_minutes", nullable = false)
    private int timeoutMinutes = 120;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt = Instant.now();

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "assigned_runner", length = 255)
    private String assignedRunner;

    @Column(name = "submitted_by", length = 255)
    private String submittedBy;

    /** Set only when the Portal Backend resolved a registered Test Engine for this job's module
     *  (docs/version2.3.md Plan 2). Non-null tells dispatchJob() to withhold EM's own static
     *  global credential — the engine already has its own key from registration. */
    @Column(name = "test_engine_code", length = 32)
    private String testEngineCode;

    /** The engine's project-specific framework subfolder (test_engines.framework_path), relative
     *  to PROJECT_FRAMEWORKS_ROOT — set only when the resolved Test Engine has one configured.
     *  Null means unchanged legacy behavior: run against the one static, shared framework path. */
    @Column(name = "framework_path", length = 500)
    private String frameworkPath;

    @Column(name = "source_type", length = 30)
    private String sourceType = "LOCAL_DEV";

    @Column(name = "git_repo_url", length = 500)
    private String gitRepoUrl;

    @Column(name = "git_branch", length = 100)
    private String gitBranch;

    @Column(name = "git_auth_type", length = 30)
    private String gitAuthType;

    @Column(name = "git_token_encrypted", columnDefinition = "TEXT")
    private String gitToken;

    @Column(name = "git_username", length = 100)
    private String gitUsername;

    @Column(name = "local_agent_id", length = 100)
    private String localAgentId;

    // Getters and Setters
    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }

    public Long getExecutionId() { return executionId; }
    public void setExecutionId(Long executionId) { this.executionId = executionId; }

    public String getSuiteXml() { return suiteXml; }
    public void setSuiteXml(String suiteXml) { this.suiteXml = suiteXml; }

    public String getEnvConfigJson() { return envConfigJson; }
    public void setEnvConfigJson(String envConfigJson) { this.envConfigJson = envConfigJson; }

    public String getFramework() { return framework; }
    public void setFramework(String framework) { this.framework = framework; }

    public String getBrowser() { return browser; }
    public void setBrowser(String browser) { this.browser = browser; }

    public String getTagFilter() { return tagFilter; }
    public void setTagFilter(String tagFilter) { this.tagFilter = tagFilter; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public int getQueuePosition() { return queuePosition; }
    public void setQueuePosition(int queuePosition) { this.queuePosition = queuePosition; }

    public int getMaxRetries() { return maxRetries; }
    public void setMaxRetries(int maxRetries) { this.maxRetries = maxRetries; }

    public int getRetryCount() { return retryCount; }
    public void setRetryCount(int retryCount) { this.retryCount = retryCount; }

    public int getTimeoutMinutes() { return timeoutMinutes; }
    public void setTimeoutMinutes(int timeoutMinutes) { this.timeoutMinutes = timeoutMinutes; }

    public Instant getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(Instant submittedAt) { this.submittedAt = submittedAt; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public String getAssignedRunner() { return assignedRunner; }
    public void setAssignedRunner(String assignedRunner) { this.assignedRunner = assignedRunner; }

    public String getSubmittedBy() { return submittedBy; }
    public void setSubmittedBy(String submittedBy) { this.submittedBy = submittedBy; }

    public String getTestEngineCode() { return testEngineCode; }
    public void setTestEngineCode(String testEngineCode) { this.testEngineCode = testEngineCode; }

    public String getFrameworkPath() { return frameworkPath; }
    public void setFrameworkPath(String frameworkPath) { this.frameworkPath = frameworkPath; }

    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }

    public String getGitRepoUrl() { return gitRepoUrl; }
    public void setGitRepoUrl(String gitRepoUrl) { this.gitRepoUrl = gitRepoUrl; }

    public String getGitBranch() { return gitBranch; }
    public void setGitBranch(String gitBranch) { this.gitBranch = gitBranch; }

    public String getGitAuthType() { return gitAuthType; }
    public void setGitAuthType(String gitAuthType) { this.gitAuthType = gitAuthType; }

    public String getGitToken() { return gitToken; }
    public void setGitToken(String gitToken) { this.gitToken = gitToken; }

    public String getGitUsername() { return gitUsername; }
    public void setGitUsername(String gitUsername) { this.gitUsername = gitUsername; }

    public String getLocalAgentId() { return localAgentId; }
    public void setLocalAgentId(String localAgentId) { this.localAgentId = localAgentId; }
}
