package com.automationportal.testcasegen.document;

import com.automationportal.testcasegen.common.ApiException;
import com.automationportal.testcasegen.generation.AiTestGenerationRun;
import com.automationportal.testcasegen.generation.AiTestGenerationRunRepository;
import com.automationportal.testcasegen.generation.GenerationService;
import com.automationportal.testcasegen.security.CurrentProjectService;
import com.automationportal.testcasegen.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SrsDocumentService {

    private static final long MAX_SIZE_BYTES = 20L * 1024 * 1024;

    private final SrsDocumentRepository repository;
    private final SrsFileStore fileStore;
    private final AiTestGenerationRunRepository runRepository;
    private final GenerationService generationService;
    private final CurrentProjectService currentProjectService;
    private final CurrentUserService currentUserService;

    @Transactional(readOnly = true)
    public List<SrsDocumentDto> list() {
        return repository.findByProjectIdOrderByCreatedAtDesc(currentProjectService.requireProjectId()).stream()
                .map(document -> SrsDocumentDto.fromEntity(document, null))
                .toList();
    }

    @Transactional(readOnly = true)
    public SrsDocumentDto get(Long id) {
        SrsDocument document = find(id);
        AiTestGenerationRun run = runRepository.findTopBySrsDocumentIdOrderByIdDesc(id).orElse(null);
        return SrsDocumentDto.fromEntity(document, run);
    }

    public SrsDocumentDto upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("An SRS document is required");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw ApiException.badRequest("File exceeds the 20MB limit");
        }

        String fileType = resolveFileType(file.getOriginalFilename());
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            throw ApiException.badRequest("Could not read the uploaded file");
        }

        SrsDocument document = repository.save(SrsDocument.builder()
                .projectId(currentProjectService.requireProjectId())
                .fileName(file.getOriginalFilename())
                .fileType(fileType)
                .fileSize(file.getSize())
                .storageId(fileStore.store(bytes))
                .status(DocumentStatus.UPLOADED)
                .uploadedBy(currentUserService.currentUserId())
                .build());

        generationService.generateAsync(document.getId());
        return SrsDocumentDto.fromEntity(document, null);
    }

    @Transactional
    public void delete(Long id) {
        SrsDocument document = find(id);
        if (document.getStorageId() != null) fileStore.delete(document.getStorageId());
        repository.delete(document);
    }

    @Transactional(readOnly = true)
    public DocumentDownload download(Long id) {
        SrsDocument document = find(id);
        byte[] bytes = document.getStorageId() == null ? null : fileStore.load(document.getStorageId());
        if (bytes == null) throw ApiException.notFound("Document file is no longer available");
        return new DocumentDownload(document.getFileName(), document.getFileType(), bytes);
    }

    /** Ownership guard: a document belonging to another project is reported as missing rather
     *  than forbidden, so ids cannot be probed to discover what exists elsewhere. */
    private SrsDocument find(Long id) {
        SrsDocument document = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Document not found with ID: " + id));
        if (!currentProjectService.requireProjectId().equals(document.getProjectId())) {
            throw ApiException.notFound("Document not found with ID: " + id);
        }
        return document;
    }

    private String resolveFileType(String fileName) {
        String name = fileName == null ? "" : fileName.toLowerCase();
        if (name.endsWith(".pdf")) return DocumentTextExtractor.PDF;
        if (name.endsWith(".docx")) return DocumentTextExtractor.DOCX;
        if (name.endsWith(".doc")) {
            throw ApiException.badRequest("Legacy .doc format is not supported. Please upload a .docx or .pdf file.");
        }
        throw ApiException.badRequest("Unsupported file type. Only PDF (.pdf) and Word (.docx) documents are supported.");
    }

    public record DocumentDownload(String fileName, String fileType, byte[] bytes) {}
}
