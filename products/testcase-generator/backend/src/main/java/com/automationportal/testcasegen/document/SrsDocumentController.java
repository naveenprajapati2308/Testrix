package com.automationportal.testcasegen.document;

import com.automationportal.testcasegen.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/documents")
@RequiredArgsConstructor
public class SrsDocumentController {

    private final SrsDocumentService service;

    @GetMapping
    public ApiResponse<List<SrsDocumentDto>> list() {
        return ApiResponse.ok(service.list());
    }

    /** Polled by the UI while generation runs — carries processedChunks/totalChunks. */
    @GetMapping("/{id}")
    public ApiResponse<SrsDocumentDto> get(@PathVariable Long id) {
        return ApiResponse.ok(service.get(id));
    }

    /** Accepted, not created: generation continues in the background and the client polls
     *  GET /{id} for progress. */
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<SrsDocumentDto> upload(@RequestParam("file") MultipartFile file) {
        return ApiResponse.created("Document uploaded — generation started", service.upload(file));
    }

    @GetMapping("/{id}/file")
    public ResponseEntity<Resource> download(@PathVariable Long id) {
        SrsDocumentService.DocumentDownload download = service.download(id);
        MediaType mediaType = DocumentTextExtractor.PDF.equals(download.fileType())
                ? MediaType.APPLICATION_PDF
                : MediaType.APPLICATION_OCTET_STREAM;

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + download.fileName().replace("\"", "") + "\"")
                .body(new ByteArrayResource(download.bytes()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }
}
