package com.automationportal.testcasegen.document;

import com.automationportal.testcasegen.common.ApiException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;

/** Extracts plain text from an uploaded SRS. Ported from Archive's documentParser.utility.js:
 *  PDFBox replaces pdf-parse, POI/XWPF replaces mammoth. */
@Component
public class DocumentTextExtractor {

    public static final String PDF = "pdf";
    public static final String DOCX = "docx";

    public String extract(byte[] bytes, String fileType) {
        String raw = switch (fileType) {
            case PDF -> extractPdf(bytes);
            case DOCX -> extractDocx(bytes);
            default -> throw ApiException.badRequest("Unsupported file type: " + fileType);
        };

        String normalized = normalize(raw);
        if (normalized.isEmpty()) {
            throw ApiException.badRequest(
                    "Document contains no extractable text. Scanned images without OCR are not supported.");
        }
        return normalized;
    }

    private String extractPdf(byte[] bytes) {
        try (PDDocument pdf = Loader.loadPDF(bytes)) {
            return new PDFTextStripper().getText(pdf);
        } catch (Exception e) {
            throw ApiException.badRequest("Failed to parse PDF document: " + e.getMessage());
        }
    }

    private String extractDocx(byte[] bytes) {
        try (XWPFDocument docx = new XWPFDocument(new ByteArrayInputStream(bytes));
             XWPFWordExtractor extractor = new XWPFWordExtractor(docx)) {
            return extractor.getText();
        } catch (Exception e) {
            throw ApiException.badRequest("Failed to parse DOCX document: " + e.getMessage());
        }
    }

    /** Preserves paragraph and heading structure (the chunker keys off both) while removing the
     *  noise PDF extraction introduces. */
    String normalize(String raw) {
        if (raw == null) return "";
        return raw
                .replace("\r\n", "\n")
                .replace("\r", "\n")
                .replaceAll("[\\u00A0\\u1680\\u180e\\u2000-\\u200a\\u202f\\u205f\\u3000\\ufeff]", " ")
                .replaceAll("[ \t]+\n", "\n")
                .replaceAll("[ \t]{2,}", " ")
                .replaceAll("\n{3,}", "\n\n")
                .trim();
    }
}
