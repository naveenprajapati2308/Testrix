package com.automationportal.em.runner;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Component
public class RunnerClient {
    private static final Logger log = LoggerFactory.getLogger(RunnerClient.class);
    private final HttpClient httpClient;

    public RunnerClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public boolean triggerRun(String runnerUrl, String executionId, String suiteXml, String portalUrl, String apiKey, String envConfigJson, String framework, String browser, String tagFilter, String frameworkPath) {
        return triggerRun(runnerUrl, executionId, suiteXml, portalUrl, apiKey, envConfigJson, framework, browser, tagFilter, frameworkPath,
                "LOCAL_DEV", "", "main", "NONE", "", "", "");
    }

    public boolean triggerRun(String runnerUrl, String executionId, String suiteXml, String portalUrl, String apiKey,
                              String envConfigJson, String framework, String browser, String tagFilter, String frameworkPath,
                              String sourceType, String gitRepoUrl, String gitBranch, String gitAuthType, String gitToken,
                              String gitUsername, String localAgentId) {
        try {
            String url = runnerUrl + "/runner/run";
            // envConfigJson is already a JSON object (or null) — embedded raw, not as a string field.
            String envConfig = (envConfigJson == null || envConfigJson.isBlank()) ? "{}" : envConfigJson;
            String frameworkVal = (framework == null || framework.isBlank()) ? "MAVEN_TESTNG" : framework;
            String browserVal = browser == null ? "" : browser;
            String tagFilterVal = tagFilter == null ? "" : tagFilter;
            String frameworkPathVal = frameworkPath == null ? "" : frameworkPath;
            String sourceTypeVal = (sourceType == null || sourceType.isBlank()) ? "LOCAL_DEV" : sourceType;
            String gitRepoUrlVal = gitRepoUrl == null ? "" : gitRepoUrl;
            String gitBranchVal = (gitBranch == null || gitBranch.isBlank()) ? "main" : gitBranch;
            String gitAuthTypeVal = (gitAuthType == null || gitAuthType.isBlank()) ? "NONE" : gitAuthType;
            String gitTokenVal = gitToken == null ? "" : gitToken;
            String gitUsernameVal = gitUsername == null ? "" : gitUsername;
            String localAgentIdVal = localAgentId == null ? "" : localAgentId;

            // JSON body
            String jsonBody = String.format(
                    "{\"executionId\":\"%s\",\"suiteXml\":\"%s\",\"portalUrl\":\"%s\",\"apiKey\":\"%s\",\"openReport\":false,\"framework\":\"%s\",\"browser\":\"%s\",\"tagFilter\":\"%s\",\"frameworkPath\":\"%s\",\"sourceType\":\"%s\",\"gitRepoUrl\":\"%s\",\"gitBranch\":\"%s\",\"gitAuthType\":\"%s\",\"gitToken\":\"%s\",\"gitUsername\":\"%s\",\"localAgentId\":\"%s\",\"envConfig\":%s}",
                    executionId, suiteXml, portalUrl, apiKey, frameworkVal, browserVal, tagFilterVal, frameworkPathVal,
                    sourceTypeVal, gitRepoUrlVal, gitBranchVal, gitAuthTypeVal, gitTokenVal, gitUsernameVal, localAgentIdVal, envConfig
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(Duration.ofSeconds(30))
                    .build();

            log.info("Sending run request to runner: {} with sourceType: {}", url, sourceTypeVal);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            log.info("Runner response: status={}, body={}", response.statusCode(), response.body());

            return response.statusCode() == 200 || response.statusCode() == 202;
        } catch (Exception e) {
            log.error("Failed to trigger execution run on runner: {}", runnerUrl, e);
            return false;
        }
    }

    public boolean triggerCancel(String runnerUrl, String executionId) {
        try {
            String url = runnerUrl + "/runner/cancel";
            String jsonBody = String.format("{\"executionId\":\"%s\"}", executionId);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(Duration.ofSeconds(5))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() == 200;
        } catch (Exception e) {
            log.error("Failed to send cancel request to runner: {}", runnerUrl, e);
            return false;
        }
    }

    public boolean checkHealth(String runnerUrl) {
        try {
            String url = runnerUrl + "/runner/health";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .GET()
                    .timeout(Duration.ofSeconds(3))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }
}
