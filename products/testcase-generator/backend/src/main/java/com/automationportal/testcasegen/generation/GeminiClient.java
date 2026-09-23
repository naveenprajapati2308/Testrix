package com.automationportal.testcasegen.generation;

import com.automationportal.testcasegen.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/** Calls Gemini for one chunk and returns the raw model text. Replaces Archive's @google/genai. */
@Slf4j
@Component
public class GeminiClient {

    private static final String ENDPOINT =
            "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";

    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    public GeminiClient(@Value("${testgen.gemini.api-key}") String apiKey,
                        @Value("${testgen.gemini.model}") String model,
                        @Value("${testgen.gemini.timeout-seconds}") int timeoutSeconds) {
        this.apiKey = apiKey;
        this.model = model;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(15));
        factory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    public String model() {
        return model;
    }

    public String generate(String prompt) {
        if (apiKey == null || apiKey.isBlank()) {
            throw ApiException.internal("GEMINI_API_KEY is not configured");
        }

        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                "generationConfig", Map.of(
                        "responseMimeType", "application/json",
                        // Reasoning tokens add latency and cost without improving structured
                        // extraction from an SRS, which is transcription rather than deduction.
                        "thinkingConfig", Map.of("thinkingBudget", 0)));

        try {
            JsonNode response = restClient.post()
                    .uri(ENDPOINT, model)
                    .header("x-goog-api-key", apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            if (response == null) return "";
            return response.path("candidates").path(0).path("content").path("parts").path(0)
                    .path("text").asText("");
        } catch (Exception e) {
            throw ApiException.internal("Gemini request failed: " + sanitize(e.getMessage()));
        }
    }

    /** The key can appear in a URL echoed back inside an error message — never let it reach a
     *  log or an API response. */
    private String sanitize(String message) {
        if (message == null) return "unknown error";
        String sanitized = message.replaceAll("(?i)key=[^&\\s]+", "key=[REDACTED]");
        return apiKey == null || apiKey.isBlank() ? sanitized : sanitized.replace(apiKey, "[REDACTED]");
    }
}
