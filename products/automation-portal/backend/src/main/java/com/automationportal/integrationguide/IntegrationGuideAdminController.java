package com.automationportal.integrationguide;

import com.automationportal.security.CurrentUserService;
import com.automationportal.common.ApiResponse;
import com.automationportal.common.ImageSniffer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

/** Super-Admin-only content management for the Integration Guide (/api/admin/** is already
 *  restricted to SUPER_ADMIN by SecurityConfig). */
@RestController
@RequestMapping("/api/admin/integration-guide")
public class IntegrationGuideAdminController {
    private static final Logger log = LoggerFactory.getLogger(IntegrationGuideAdminController.class);
    private final IntegrationGuideSectionRepository repository;
    private final CurrentUserService currentUserService;

    @Value("${portal.uploads.guide-images-dir:artifacts/guide-images}")
    private String guideImagesDir;

    public IntegrationGuideAdminController(IntegrationGuideSectionRepository repository,
                                           CurrentUserService currentUserService) {
        this.repository = repository;
        this.currentUserService = currentUserService;
    }

    public record SectionRequest(int sortOrder, String title, String body) {}

    @PostMapping
    public ApiResponse<IntegrationGuideSection> create(@RequestBody SectionRequest body) {
        if (body.title() == null || body.title().isBlank()) throw new IllegalArgumentException("Title is required");
        if (body.body() == null || body.body().isBlank()) throw new IllegalArgumentException("Body is required");
        IntegrationGuideSection section = new IntegrationGuideSection();
        section.setSortOrder(body.sortOrder());
        section.setTitle(body.title());
        section.setBody(body.body());
        section.setUpdatedByUserId(currentUserService.currentUser().id());
        return ApiResponse.ok(repository.save(section));
    }

    @PutMapping("/{id}")
    public ApiResponse<IntegrationGuideSection> update(@PathVariable Long id, @RequestBody SectionRequest body) {
        IntegrationGuideSection section = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Section not found"));
        if (body.title() == null || body.title().isBlank()) throw new IllegalArgumentException("Title is required");
        if (body.body() == null || body.body().isBlank()) throw new IllegalArgumentException("Body is required");
        section.setSortOrder(body.sortOrder());
        section.setTitle(body.title());
        section.setBody(body.body());
        section.setUpdatedByUserId(currentUserService.currentUser().id());
        return ApiResponse.ok(repository.save(section));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        repository.findById(id).ifPresent(section -> deleteImageFileIfExists(section.getImagePath()));
        repository.deleteById(id);
        return ApiResponse.ok(null);
    }

    @GetMapping
    public ApiResponse<List<IntegrationGuideSection>> list() {
        return ApiResponse.ok(repository.findAllByOrderBySortOrderAsc());
    }

    @PostMapping("/{id}/image")
    public ApiResponse<IntegrationGuideSection> uploadImage(@PathVariable Long id,
                                                             @RequestParam("file") MultipartFile file) throws IOException {
        IntegrationGuideSection section = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Section not found"));

        // Same reasoning as ProfileController's upload: never trust client-supplied Content-Type
        // or filename, sniff the real magic bytes before this becomes a served /uploads/** URL.
        String extension = ImageSniffer.sniffExtension(file);
        if (extension == null) {
            throw new IllegalArgumentException("Only PNG, JPEG, GIF, or WEBP image files are allowed");
        }
        String filename = UUID.randomUUID() + extension;
        Path dir = Paths.get(guideImagesDir).toAbsolutePath();
        Files.createDirectories(dir);
        Files.copy(file.getInputStream(), dir.resolve(filename));

        String previousImagePath = section.getImagePath();
        section.setImagePath("/uploads/guide-images/" + filename);
        section.setUpdatedByUserId(currentUserService.currentUser().id());
        IntegrationGuideSection saved = repository.save(section);
        deleteImageFileIfExists(previousImagePath);
        return ApiResponse.ok(saved);
    }

    @DeleteMapping("/{id}/image")
    public ApiResponse<IntegrationGuideSection> removeImage(@PathVariable Long id) {
        IntegrationGuideSection section = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Section not found"));
        String previousImagePath = section.getImagePath();
        section.setImagePath(null);
        section.setUpdatedByUserId(currentUserService.currentUser().id());
        IntegrationGuideSection saved = repository.save(section);
        deleteImageFileIfExists(previousImagePath);
        return ApiResponse.ok(saved);
    }

    // Best-effort cleanup — the DB update (source of truth for what's "current") has already
    // succeeded either way, so a disk failure here only leaves an orphaned file, never blocks
    // the request or gets retried against a wrong path from user input.
    private void deleteImageFileIfExists(String imagePath) {
        if (imagePath == null || imagePath.isBlank()) return;
        String filename = Paths.get(imagePath).getFileName().toString();
        Path target = Paths.get(guideImagesDir).toAbsolutePath().resolve(filename);
        try {
            Files.deleteIfExists(target);
        } catch (IOException e) {
            log.warn("Failed to delete old integration guide image file: {}", target, e);
        }
    }
}
