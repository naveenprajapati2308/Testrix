package com.testrix.platform.mail;

import com.testrix.platform.auth.OtpPurpose;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.UnsupportedEncodingException;
import java.util.List;
import java.util.Map;

/**
 * Every outbound email in the platform (OTPs, workspace-approval notices, ...) goes through here.
 * Falls back to logging the rendered email instead of sending whenever no real SMTP username is
 * configured, regardless of portal.mail.console-only — so environments without SMTP_* env vars
 * (e.g. a plain local run) never fail on a missing mail server.
 */
@Service
public class MailService {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);
    private final JavaMailSender sender;
    private final MailTemplateService templates;
    private final boolean consoleOnly;
    private final String from;
    private final String fromName;

    public MailService(JavaMailSender sender,
                       MailTemplateService templates,
                       @Value("${portal.mail.console-only}") boolean consoleOnly,
                       @Value("${spring.mail.username:}") String smtpUsername,
                       @Value("${portal.mail.from}") String from,
                       @Value("${portal.mail.from-name}") String fromName) {
        this.sender = sender;
        this.templates = templates;
        this.consoleOnly = consoleOnly || smtpUsername.isBlank();
        this.from = from;
        this.fromName = fromName;
    }

    public void sendOtp(String email, String otp, OtpPurpose purpose, int expiryMinutes) {
        String html = templates.render("otp", Map.of(
            "preheader", "Your Testrix verification code",
            "heading", purpose.heading(),
            "intro", purpose.intro(),
            "otp", otp,
            "expiryMinutes", String.valueOf(expiryMinutes)
        ));
        send(email, purpose.subject(), html);
    }

    public void sendWorkspaceApproved(String email, String workspaceName, String workspaceCode,
                                      String username, String tempPassword, String loginUrl) {
        String html = templates.render("workspace-approved", Map.of(
            "preheader", "Your Testrix workspace is ready",
            "workspaceName", workspaceName,
            "workspaceCode", workspaceCode,
            "username", username,
            "tempPassword", tempPassword,
            "loginUrl", loginUrl
        ));
        send(email, "Your Testrix workspace \"" + workspaceName + "\" is ready", html);
    }

    public void sendProjectUserAdded(String email, String username, String tempPassword, String projectName,
                                     String workspaceCode, String roles, String invitedByName, String loginUrl) {
        String html = templates.render("project-user-added", Map.of(
            "preheader", "Your Testrix account is ready",
            "projectName", projectName,
            "workspaceCode", workspaceCode,
            "username", username,
            "tempPassword", tempPassword,
            "roles", roles,
            "invitedByName", invitedByName,
            "loginUrl", loginUrl
        ));
        send(email, "You've been added to \"" + projectName + "\" on Testrix", html);
    }

    public void sendProjectUserAttached(String email, String username, String projectName,
                                        String workspaceCode, String roles, String invitedByName, String loginUrl) {
        String html = templates.render("project-user-attached", Map.of(
            "preheader", "You now have access to a new Testrix workspace",
            "projectName", projectName,
            "workspaceCode", workspaceCode,
            "username", username,
            "roles", roles,
            "invitedByName", invitedByName,
            "loginUrl", loginUrl
        ));
        send(email, "You've been added to \"" + projectName + "\" on Testrix", html);
    }

    public void sendPasswordChanged(String email, String username) {
        String html = templates.render("password-changed", Map.of(
            "preheader", "Your Testrix password was changed",
            "username", username
        ));
        send(email, "Your Testrix password was changed", html);
    }

    private void send(String email, String subject, String html) {
        if (consoleOnly) {
            log.info("Mail to {} [{}]:\n{}", email, subject, html);
            return;
        }
        try {
            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            // Gmail (and most SMTP relays) reject a From address that isn't the authenticated
            // account or a verified alias, so the address itself stays the SMTP account — only
            // the display name can read "Testrix" to recipients.
            helper.setFrom(from, fromName);
            helper.setTo(email);
            helper.setSubject(subject);
            helper.setText(html, true);
            sender.send(message);
        } catch (MessagingException | UnsupportedEncodingException e) {
            throw new IllegalStateException("Failed to send email to " + email, e);
        }
    }

    public record Attachment(String filename, String contentType, byte[] bytes) { }

    /** Used by other products in the platform (e.g. api-testing's execution reports) via the
     * internal mail endpoint — same SMTP account, same From/console-only rules as every other
     * outbound mail, just multipart with file attachments instead of a single template. */
    public void sendWithAttachments(List<String> to, String subject, String html, List<Attachment> attachments) {
        if (consoleOnly) {
            log.info("Mail to {} [{}] with {} attachment(s):\n{}", to, subject, attachments.size(), html);
            return;
        }
        try {
            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(from, fromName);
            helper.setTo(to.toArray(new String[0]));
            helper.setSubject(subject);
            helper.setText(html, true);
            for (Attachment a : attachments) {
                helper.addAttachment(a.filename(), new ByteArrayResource(a.bytes()), a.contentType());
            }
            sender.send(message);
        } catch (MessagingException | UnsupportedEncodingException e) {
            throw new IllegalStateException("Failed to send email to " + to, e);
        }
    }
}
