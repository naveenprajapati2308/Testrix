package com.automationportal.apitesting.report;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.automationportal.apitesting.validation.ValidationResultView;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** Renders a {@link ReportData} to PDF bytes via an internal HTML template — same content as
 * {@link ReportMarkdownRenderer}, just a different presentation for the same underlying data. */
@Component
public class ReportPdfRenderer {

    public byte[] render(ReportData data) {
        String html = buildHtml(data);
        ByteArrayOutputStream os = new ByteArrayOutputStream();
        try {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.withHtmlContent(html, null);
            builder.toStream(os);
            builder.run();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to render report PDF", e);
        }
        return os.toByteArray();
    }

    private String buildHtml(ReportData data) {
        StringBuilder h = new StringBuilder();
        h.append("<html><head><meta charset=\"UTF-8\"/><style>")
                .append("body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#1a1a1a;}")
                .append("h1{font-size:18px;} h2{font-size:14px;margin-top:24px;border-bottom:1px solid #ccc;padding-bottom:4px;}")
                .append("table{border-collapse:collapse;width:100%;margin:6px 0;} td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;font-size:10px;}")
                .append("pre{background:#f5f5f5;padding:6px;white-space:pre-wrap;word-break:break-all;font-size:9px;border:1px solid #ddd;}")
                .append(".pass{color:#0a7d2c;font-weight:bold;} .fail{color:#c0261e;font-weight:bold;}")
                .append("</style></head><body>");

        h.append("<h1>Execution Report — ").append(esc(data.getTargetName())).append("</h1>");
        h.append("<table>")
                .append(row("Type", data.getReportType()))
                .append(row("Status", data.getStatus()))
                .append(row("Triggered by", data.getTriggeredBy()
                        + (data.getTriggeredByEmail() != null ? " (" + data.getTriggeredByEmail() + ")" : "")))
                .append(data.getRecipients() != null ? row("Recipients", data.getRecipients()) : "")
                .append(row("Started", fmt(data.getStartedAt())))
                .append(row("Finished", fmt(data.getFinishedAt())))
                .append(row("Total / Passed / Failed", data.getTotalApis() + " / " + data.getPassedApis() + " / " + data.getFailedApis()))
                .append(data.getHealthPercent() != null ? row("Health", data.getHealthPercent() + "%") : "")
                .append("</table>");

        int i = 1;
        for (ApiCallBlock c : data.getCalls()) {
            h.append("<h2>").append(i++).append(". ").append(esc(c.getName())).append(" — ")
                    .append(esc(c.getMethod())).append(" ").append(esc(c.getUrl())).append("</h2>");

            h.append("<b>Request Headers</b><pre>").append(escPre(c.getRequestHeaders())).append("</pre>");
            h.append("<b>Request Payload</b><pre>").append(escPre(c.getRequestBody())).append("</pre>");
            if (c.getInjectedVariables() != null) {
                h.append("<b>Injected Variables</b><pre>").append(escPre(c.getInjectedVariables())).append("</pre>");
            }

            h.append("<b>Response</b> — status ").append(c.getResponseStatusCode()).append(" ")
                    .append(esc(c.getResponseStatusMessage())).append(", ").append(c.getTotalTimeMs()).append("ms")
                    .append(c.getResponseSizeBytes() != null ? ", " + c.getResponseSizeBytes() + " bytes" : "");
            h.append("<pre>").append(escPre(c.getResponseHeaders())).append("</pre>");
            h.append("<pre>").append(escPre(c.getResponseBody())).append("</pre>");
            if (c.getErrorMessage() != null) h.append("<p><b>Error:</b> ").append(esc(c.getErrorMessage())).append("</p>");

            h.append("<b>Validation Rules</b>");
            List<ValidationResultView> rules = c.getValidationResults();
            if (rules == null || rules.isEmpty()) {
                h.append("<p>No rules configured.</p>");
            } else {
                h.append("<table><tr><th>Field</th><th>Operator</th><th>Expected</th><th>Actual</th><th>Result</th></tr>");
                for (ValidationResultView v : rules) {
                    h.append("<tr><td>").append(esc(v.jsonPath())).append("</td><td>").append(esc(v.operator()))
                            .append("</td><td>").append(esc(v.expectedValue())).append("</td><td>")
                            .append(esc(v.actualValue())).append("</td><td class=\"")
                            .append(v.passed() ? "pass\">PASS" : "fail\">FAIL").append("</td></tr>");
                }
                h.append("</table>");
            }

            h.append("<b>Required Payload Fields</b>");
            List<com.automationportal.apitesting.validation.FieldValidationResult> required = c.getRequiredFieldResults();
            if (required == null || required.isEmpty()) {
                h.append("<p>No fields marked Required.</p>");
            } else {
                h.append("<table><tr><th>Field</th><th>Source</th><th>Enforced by backend</th></tr>");
                for (com.automationportal.apitesting.validation.FieldValidationResult f : required) {
                    h.append("<tr><td>").append(esc(f.getKey())).append("</td><td>").append(esc(f.getSource()))
                            .append("</td><td class=\"").append(f.isEnforced() ? "pass\">YES" : "fail\">NO").append("</td></tr>");
                }
                h.append("</table>");
            }

            h.append("<p>Overall: <span class=\"").append(Boolean.TRUE.equals(c.getValidationPassed()) ? "pass\">PASS" : "fail\">FAIL")
                    .append("</span></p>");
        }

        h.append("</body></html>");
        return h.toString();
    }

    private static String row(String label, Object value) {
        return "<tr><td><b>" + label + "</b></td><td>" + esc(value) + "</td></tr>";
    }

    private static String esc(Object v) {
        if (v == null) return "";
        return v.toString()
                .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    /** openhtmltopdf doesn't support CSS word-break/overflow-wrap, so a single long unbroken
     * token (a compact JSON body, a long cookie header, a URL with no spaces) gives its layout
     * engine an unbounded-width line to lay out — which in practice can hang rendering rather
     * than just look wide. Inserting a zero-width space every 40 chars gives it real break
     * points without changing what the text looks like. Must run on the RAW string before
     * esc() — breaking mid-entity (e.g. "&am[ZWSP]p;") produces invalid XML the XHTML parser
     * rejects outright. */
    private static String escPre(Object v) {
        if (v == null) return "";
        String raw = v.toString();
        if (raw.length() <= 40) return esc(raw);
        StringBuilder out = new StringBuilder(raw.length() + raw.length() / 40);
        int sinceBreak = 0;
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            out.append(ch);
            sinceBreak = (ch == ' ' || ch == '\n') ? 0 : sinceBreak + 1;
            if (sinceBreak >= 40) {
                out.append('​');
                sinceBreak = 0;
            }
        }
        return esc(out.toString());
    }

    private static String fmt(java.time.Instant instant) {
        return instant == null ? "" : DateTimeFormatter.ISO_INSTANT.format(instant);
    }
}
