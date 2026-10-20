package testrix;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Pushes execution lifecycle events to Testrix. Every call is fire-and-forget — a Testrix outage
 * must never fail or block the actual test run, so failures are only logged, never thrown.
 */
public final class PortalApiClient {
    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private PortalApiClient() {}

    public static void sendEvent(String eventType, Map<String, Object> data) {
        String portalUrl = ConfigUtils.get("portal.url");
        String apiKey = ConfigUtils.get("portal.api.key");
        String executionId = ConfigUtils.get("executionId");
        if (portalUrl == null || portalUrl.isBlank() || !portalUrl.startsWith("http") || portalUrl.contains("{{")
                || apiKey == null || apiKey.isBlank() || apiKey.contains("{{")
                || executionId == null || executionId.isBlank() || executionId.contains("{{")) {
            // Testrix portal connection is not configured or still has template placeholders — skip silently
            return;
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(portalUrl + "/api/events/execution"))
                .header("Content-Type", "application/json")
                .header("X-API-Key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(toJson(executionId, eventType, data)))
                .build();

        CompletableFuture.runAsync(() -> {
            try {
                HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() >= 400) {
                    System.err.println("[Testrix] " + eventType + " rejected: HTTP " + response.statusCode());
                }
            } catch (Exception e) {
                System.err.println("[Testrix] Failed to send " + eventType + ": " + e.getMessage());
            }
        });
    }

    private static String toJson(String executionId, String eventType, Map<String, Object> data) {
        StringBuilder dataJson = new StringBuilder("{");
        boolean first = true;
        for (var entry : data.entrySet()) {
            if (!first) dataJson.append(',');
            first = false;
            dataJson.append('"').append(escape(entry.getKey())).append("\":");
            Object value = entry.getValue();
            dataJson.append(value == null ? "null" : '"' + escape(String.valueOf(value)) + '"');
        }
        dataJson.append('}');
        return "{\"executionId\":\"" + escape(executionId) + "\",\"eventType\":\"" + escape(eventType)
                + "\",\"timestamp\":\"" + Instant.now() + "\",\"data\":" + dataJson + "}";
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
