package com.automationportal.apitesting.report;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;

/**
 * Sends the execution-report email through the platform service's configured SMTP account
 * (see its InternalMailController) instead of standing up a second mailer here.
 * Failures are logged, never thrown — a report email going astray must not affect the
 * schedule/group's own recorded pass/fail result.
 */
@Slf4j
@Component
public class ReportMailClient {

    private final WebClient client;
    private final String apiKey;

    public ReportMailClient(@Value("${report.mail.internal-url}") String internalUrl,
                            @Value("${report.mail.api-key}") String apiKey) {
        this.client = WebClient.builder().baseUrl(internalUrl).build();
        this.apiKey = apiKey;
    }

    public void send(List<String> to, String subject, String html, byte[] pdf, byte[] md) {
        if (to == null || to.isEmpty()) {
            log.warn("Skipping report email — no recipients (subject='{}')", subject);
            return;
        }
        try {
            MultipartBodyBuilder body = new MultipartBodyBuilder();
            body.part("to", String.join(",", to));
            body.part("subject", subject);
            body.part("html", html);
            body.part("pdf", new ByteArrayResource(pdf) {
                @Override public String getFilename() { return "execution-report.pdf"; }
            }).header("Content-Type", MediaType.APPLICATION_PDF_VALUE);
            body.part("md", new ByteArrayResource(md) {
                @Override public String getFilename() { return "execution-report.md"; }
            }).header("Content-Type", "text/markdown");

            client.post()
                    .uri("")
                    .header("X-API-Key", apiKey)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .bodyValue(body.build())
                    .retrieve()
                    .toBodilessEntity()
                    .timeout(Duration.ofSeconds(30))
                    .block();
        } catch (Exception e) {
            log.error("Failed to send execution report email to {}: {}", to, e.getMessage(), e);
        }
    }
}
