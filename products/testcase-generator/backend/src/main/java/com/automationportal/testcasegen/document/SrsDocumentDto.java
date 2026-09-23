package com.automationportal.testcasegen.document;

import com.automationportal.testcasegen.generation.AiTestGenerationRun;

import java.time.Instant;

public record SrsDocumentDto(
        Long id,
        String fileName,
        String fileType,
        Long fileSize,
        DocumentStatus status,
        int totalChunks,
        int processedChunks,
        int totalTestCases,
        String errorMessage,
        Instant createdAt) {

    public static SrsDocumentDto fromEntity(SrsDocument document, AiTestGenerationRun run) {
        return new SrsDocumentDto(
                document.getId(),
                document.getFileName(),
                document.getFileType(),
                document.getFileSize(),
                document.getStatus(),
                run != null ? run.getTotalChunks() : document.getTotalChunks(),
                run != null ? run.getProcessedChunks() : 0,
                document.getTotalTestCases(),
                document.getErrorMessage(),
                document.getCreatedAt());
    }
}
