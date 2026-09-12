package com.testrix.platform.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

/**
 * Internal, service-to-service only: lets other products in the platform (currently api-testing's
 * execution reports) send mail through this service's one already-configured SMTP account, instead
 * of every product standing up its own mailer. Protected the same way execution events already are
 * (see {@link com.testrix.platform.events.ExecutionEventController}) — a shared X-API-Key header,
 * not end-user JWT, since the caller can be a background scheduler thread with no request context.
 */
@RestController
@RequestMapping("/api/internal/reports")
public class InternalMailController {
    private static final Logger log = LoggerFactory.getLogger(InternalMailController.class);

    private final MailService mailService;

    @Value("${portal.events.api-key}")
    private String expectedApiKey;

    public InternalMailController(MailService mailService) {
        this.mailService = mailService;
    }

    @PostMapping(value = "/mail", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> sendReportMail(
            @RequestHeader(value = "X-API-Key", required = false) String apiKey,
            @RequestParam String to,
            @RequestParam String subject,
            @RequestParam String html,
            @RequestPart("pdf") MultipartFile pdf,
            @RequestPart("md") MultipartFile md) {
        if (expectedApiKey == null || expectedApiKey.isEmpty() || !expectedApiKey.equals(apiKey)) {
            log.warn("Unauthorized internal mail request: invalid or missing X-API-Key header");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid or missing X-API-Key header");
        }
        List<String> recipients = Arrays.stream(to.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (recipients.isEmpty()) {
            return ResponseEntity.badRequest().body("No recipients");
        }
        try {
            mailService.sendWithAttachments(recipients, subject, html, List.of(
                    new MailService.Attachment(pdf.getOriginalFilename(), "application/pdf", pdf.getBytes()),
                    new MailService.Attachment(md.getOriginalFilename(), "text/markdown", md.getBytes())
            ));
            return ResponseEntity.ok().build();
        } catch (IOException e) {
            log.error("Failed to read report attachment for {}: {}", recipients, e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(e.getMessage());
        }
    }
}
