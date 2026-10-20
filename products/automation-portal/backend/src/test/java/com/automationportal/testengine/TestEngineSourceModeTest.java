package com.automationportal.testengine;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TestEngineSourceModeTest {

    @Test
    void testGitRemoteEngineSummaryMapping() {
        TestEngine engine = new TestEngine();
        engine.setBusinessId("ENG_GIT_001");
        engine.setName("My Git Playwright Suite");
        engine.setEngineType(EngineType.PLAYWRIGHT);
        engine.setSourceType(SourceType.GIT_REMOTE);
        engine.setGitRepoUrl("https://github.com/my-org/automation-repo.git");
        engine.setGitBranch("develop");
        engine.setGitAuthType(GitAuthType.TOKEN);
        engine.setGitTokenEncrypted("encrypted_blob_data_xyz");
        engine.setStatus(EngineStatus.REGISTERED);

        TestEngineDtos.Summary summary = TestEngineDtos.Summary.from(engine, "eng_sec_test", "ghp_****4567");

        assertEquals(SourceType.GIT_REMOTE, summary.sourceType());
        assertEquals("https://github.com/my-org/automation-repo.git", summary.gitRepoUrl());
        assertEquals("develop", summary.gitBranch());
        assertEquals(GitAuthType.TOKEN, summary.gitAuthType());
        assertTrue(summary.hasGitToken());
        assertEquals("ghp_****4567", summary.gitTokenMasked());
    }

    @Test
    void testLocalDevEngineSummaryDefaults() {
        TestEngine engine = new TestEngine();
        engine.setBusinessId("ENG_LOC_001");
        engine.setName("Local Dev Suite");
        engine.setEngineType(EngineType.SELENIUM);
        engine.setFrameworkPath("my-selenium-tests");
        engine.setStatus(EngineStatus.REGISTERED);

        TestEngineDtos.Summary summary = TestEngineDtos.Summary.from(engine, "eng_sec_local");

        assertEquals(SourceType.LOCAL_DEV, summary.sourceType());
        assertFalse(summary.hasGitToken());
        assertNull(summary.gitTokenMasked());
        assertEquals("my-selenium-tests", summary.frameworkPath());
    }
}
