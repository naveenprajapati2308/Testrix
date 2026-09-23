package com.automationportal.testcasegen.exchange;

import com.automationportal.testcasegen.common.ApiException;
import com.automationportal.testcasegen.common.ApiResponse;
import com.automationportal.testcasegen.testcase.TestCaseDto;
import com.automationportal.testcasegen.testcase.TestCaseService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** Export and import are authenticated like every other endpoint — they would otherwise be a
 *  way to pull a whole project's test cases out, or overwrite them, without a token. */
@RestController
@RequestMapping("/api/v1/test-cases")
@RequiredArgsConstructor
public class TestCaseExchangeController {

    private static final String XLSX_MEDIA_TYPE =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final TestCaseExportService exportService;
    private final TestCaseImportService importService;
    private final TestCaseService testCaseService;

    @GetMapping("/export")
    public ResponseEntity<Resource> export(@RequestParam(required = false) Long documentId,
                                           @RequestParam(defaultValue = "xlsx") String format) {
        return switch (format.toLowerCase()) {
            case "xlsx" -> download(exportService.toXlsx(documentId), "test-cases.xlsx", XLSX_MEDIA_TYPE);
            case "csv" -> download(exportService.toCsv(documentId), "test-cases.csv", "text/csv");
            default -> throw ApiException.badRequest("Unsupported export format: " + format);
        };
    }

    /** JSON export goes through the normal envelope rather than a file download, so the UI can
     *  reuse it without a second code path. */
    @GetMapping("/export/json")
    public ApiResponse<List<TestCaseDto>> exportJson(@RequestParam(required = false) Long documentId) {
        return ApiResponse.ok(testCaseService.list(documentId));
    }

    /** apply=false returns the diff for confirmation; apply=true writes it. */
    @PostMapping("/import")
    public ApiResponse<TestCaseImportService.ImportResult> importFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) Long documentId,
            @RequestParam(defaultValue = "false") boolean apply) {
        return ApiResponse.ok(importService.importFile(file, documentId, apply));
    }

    private ResponseEntity<Resource> download(byte[] bytes, String fileName, String mediaType) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mediaType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .body(new ByteArrayResource(bytes));
    }
}
