package com.automationportal.testengine;

import java.time.Instant;

public final class TestEngineDtos {
    private TestEngineDtos() {}

    public record RegisterRequest(
        EngineType engineType,
        String name,
        String description,
        DeploymentType deploymentType,
        String endpoint,
        String frameworkPath,
        String reportPath,
        SourceType sourceType,
        String gitRepoUrl,
        String gitBranch,
        GitAuthType gitAuthType,
        String gitToken,
        String gitUsername,
        String localAgentId
    ) {}

    public record UpdateRequest(
        String name,
        String description,
        DeploymentType deploymentType,
        String endpoint,
        String frameworkPath,
        String reportPath,
        SourceType sourceType,
        String gitRepoUrl,
        String gitBranch,
        GitAuthType gitAuthType,
        String gitToken,
        String gitUsername,
        String localAgentId
    ) {}

    public record Summary(
        Long id,
        String businessId,
        EngineType engineType,
        String name,
        String description,
        DeploymentType deploymentType,
        String endpoint,
        String frameworkPath,
        String reportPath,
        SourceType sourceType,
        String gitRepoUrl,
        String gitBranch,
        GitAuthType gitAuthType,
        String gitTokenMasked,
        boolean hasGitToken,
        String gitUsername,
        String localAgentId,
        String localAgentStatus,
        EngineStatus status,
        String health,
        Instant lastHeartbeatAt,
        String activeKeyPrefix,
        Instant createdAt
    ) {
        public static Summary from(TestEngine e, String activeKeyPrefix) {
            return from(e, activeKeyPrefix, null);
        }

        public static Summary from(TestEngine e, String activeKeyPrefix, String maskedGitToken) {
            boolean hasToken = e.getGitTokenEncrypted() != null && !e.getGitTokenEncrypted().isBlank();
            return new Summary(
                e.getId(), e.getBusinessId(), e.getEngineType(), e.getName(), e.getDescription(),
                e.getDeploymentType(), e.getEndpoint(), e.getFrameworkPath(), e.getReportPath(),
                e.getSourceType() != null ? e.getSourceType() : SourceType.LOCAL_DEV,
                e.getGitRepoUrl(), e.getGitBranch() != null ? e.getGitBranch() : "main",
                e.getGitAuthType() != null ? e.getGitAuthType() : GitAuthType.NONE,
                maskedGitToken, hasToken, e.getGitUsername(),
                e.getLocalAgentId(), e.getLocalAgentStatus(),
                e.getStatus(), health(e),
                e.getLastHeartbeatAt(), activeKeyPrefix, e.getCreatedAt()
            );
        }

        private static String health(TestEngine e) {
            if (e.getStatus() == EngineStatus.DISABLED) return "DISABLED";
            if (e.getLastHeartbeatAt() == null) return "NEVER_CONNECTED";
            boolean stale = e.getLastHeartbeatAt().isBefore(Instant.now().minusSeconds(600));
            return stale ? "STALE" : "HEALTHY";
        }
    }

    /** Returned exactly once, at registration or rotation — never retrievable again afterward. */
    public record CredentialIssued(String plaintextKey, String keyPrefix, Instant issuedAt) {}

    /**
     * apiKey is optional — sent only in the moment right after registration/rotation, while the
     * caller still has the just-revealed plaintext in hand (Testrix itself never stores or
     * re-exposes it). Omitted on a later download, which falls back to a placeholder in the zip.
     * portalUrl is supplied by the browser (window.location.origin + "/automation") rather than
     * guessed server-side, so it's correct regardless of hostname/port the workspace actually uses.
     */
    public record StarterKitRequest(String apiKey, String portalUrl) {}

    public record TestGitConnectionRequest(
        String gitRepoUrl,
        String gitBranch,
        GitAuthType gitAuthType,
        String gitToken,
        String gitUsername
    ) {}

    public record TestGitConnectionResult(
        boolean success,
        String message,
        String branch,
        int exitCode
    ) {}

    public record VerifyFolderRequest(String frameworkPath) {}
}
