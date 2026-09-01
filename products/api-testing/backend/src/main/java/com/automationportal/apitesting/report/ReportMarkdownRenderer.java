package com.automationportal.apitesting.report;

import com.automationportal.apitesting.validation.FieldValidationResult;
import com.automationportal.apitesting.validation.ValidationResultView;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.List;

/** Renders a {@link ReportData} as GFM markdown — every captured field, nothing summarized away. */
@Component
public class ReportMarkdownRenderer {

    public String render(ReportData data) {
        StringBuilder md = new StringBuilder();
        md.append("# Execution Report — ").append(nz(data.getTargetName())).append("\n\n");
        md.append("| | |\n|---|---|\n");
        md.append("| Type | ").append(nz(data.getReportType())).append(" |\n");
        md.append("| Status | ").append(nz(data.getStatus())).append(" |\n");
        md.append("| Triggered by | ").append(nz(data.getTriggeredBy()))
                .append(data.getTriggeredByEmail() != null ? " (" + data.getTriggeredByEmail() + ")" : "").append(" |\n");
        if (data.getRecipients() != null) md.append("| Recipients | ").append(data.getRecipients()).append(" |\n");
        md.append("| Started | ").append(fmt(data.getStartedAt())).append(" |\n");
        md.append("| Finished | ").append(fmt(data.getFinishedAt())).append(" |\n");
        md.append("| Total / Passed / Failed | ").append(data.getTotalApis()).append(" / ")
                .append(data.getPassedApis()).append(" / ").append(data.getFailedApis()).append(" |\n");
        if (data.getHealthPercent() != null) md.append("| Health | ").append(data.getHealthPercent()).append("% |\n");
        md.append("\n---\n\n");

        int i = 1;
        for (ApiCallBlock c : data.getCalls()) {
            md.append("## ").append(i++).append(". ").append(nz(c.getName()))
                    .append(" — ").append(nz(c.getMethod())).append(" ").append(nz(c.getUrl())).append("\n\n");

            md.append("**Request Headers**\n\n```\n").append(nz(c.getRequestHeaders())).append("\n```\n\n");
            md.append("**Request Payload**\n\n```\n").append(nz(c.getRequestBody())).append("\n```\n\n");
            if (c.getInjectedVariables() != null) {
                md.append("**Injected Variables**\n\n```\n").append(c.getInjectedVariables()).append("\n```\n\n");
            }

            md.append("**Response** — status ").append(c.getResponseStatusCode()).append(" ")
                    .append(nz(c.getResponseStatusMessage())).append(", ").append(c.getTotalTimeMs()).append("ms")
                    .append(c.getResponseSizeBytes() != null ? ", " + c.getResponseSizeBytes() + " bytes" : "")
                    .append("\n\n");
            md.append("Response Headers\n\n```\n").append(nz(c.getResponseHeaders())).append("\n```\n\n");
            md.append("Response Body\n\n```\n").append(nz(c.getResponseBody())).append("\n```\n\n");
            if (c.getErrorMessage() != null) md.append("**Error**: ").append(c.getErrorMessage()).append("\n\n");

            md.append("**Validation Rules**\n\n");
            List<ValidationResultView> rules = c.getValidationResults();
            if (rules == null || rules.isEmpty()) {
                md.append("_No rules configured._\n\n");
            } else {
                md.append("| Field | Operator | Expected | Actual | Result |\n|---|---|---|---|---|\n");
                for (ValidationResultView v : rules) {
                    md.append("| ").append(nz(v.jsonPath())).append(" | ").append(nz(v.operator())).append(" | ")
                            .append(nz(v.expectedValue())).append(" | ").append(nz(v.actualValue())).append(" | ")
                            .append(v.passed() ? "PASS" : "FAIL").append(" |\n");
                }
                md.append("\n");
            }

            md.append("**Required Payload Fields**\n\n");
            List<FieldValidationResult> required = c.getRequiredFieldResults();
            if (required == null || required.isEmpty()) {
                md.append("_No fields marked Required._\n\n");
            } else {
                md.append("| Field | Source | Enforced by backend |\n|---|---|---|\n");
                for (FieldValidationResult f : required) {
                    md.append("| ").append(nz(f.getKey())).append(" | ").append(nz(f.getSource())).append(" | ")
                            .append(f.isEnforced() ? "YES" : "NO").append(" |\n");
                }
                md.append("\n");
            }

            md.append("Overall: **").append(Boolean.TRUE.equals(c.getValidationPassed()) ? "PASS" : "FAIL")
                    .append("**\n\n---\n\n");
        }
        return md.toString();
    }

    private static String nz(Object v) { return v == null ? "" : v.toString(); }

    private static String fmt(java.time.Instant instant) {
        return instant == null ? "" : DateTimeFormatter.ISO_INSTANT.format(instant);
    }
}
