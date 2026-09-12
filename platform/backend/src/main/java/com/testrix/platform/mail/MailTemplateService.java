package com.testrix.platform.mail;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Renders the HTML body for an outbound email from
 * classpath:mail-templates/*.html, filling in
 * {{token}} placeholders and wrapping the result in the shared Testrix layout.
 * Editing an email's
 * wording is just editing its .html file here — no Java changes needed.
 */
@Service
public class MailTemplateService {

    public String render(String templateName, Map<String, String> variables) {
        String content = applyVariables(loadTemplate(templateName), variables);
        return applyVariables(loadTemplate("layout"), Map.of(
                "content", content,
                "preheader", variables.getOrDefault("preheader", "")));
    }

    private String loadTemplate(String name) {
        try (InputStream in = new ClassPathResource("mail-templates/" + name + ".html").getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Missing mail template: " + name, e);
        }
    }

    private String applyVariables(String template, Map<String, String> variables) {
        String result = template;
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            result = result.replace("{{" + entry.getKey() + "}}", entry.getValue() == null ? "" : entry.getValue());
        }
        return result;
    }
}
