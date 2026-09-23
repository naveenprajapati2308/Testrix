package com.automationportal.testcasegen.document;

import com.automationportal.testcasegen.common.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/**
 * Raw-bytes local-filesystem store for uploaded SRS documents (volume-mounted in Docker), the
 * same shape as api-testing's FormDataFileStore. Ids are random UUIDs and the directory is not
 * exposed by any nginx route, so a document can only be read back through the authenticated,
 * ownership-checked download endpoint.
 */
@Slf4j
@Component
public class SrsFileStore {

    private final Path root;

    public SrsFileStore(@Value("${testgen.storage.dir}") String dir) throws IOException {
        this.root = Path.of(dir);
        Files.createDirectories(root);
    }

    public String store(byte[] bytes) {
        String id = UUID.randomUUID().toString();
        try {
            Files.write(resolve(id), bytes);
            return id;
        } catch (IOException e) {
            log.error("Failed to store SRS file: {}", e.getMessage());
            throw ApiException.internal("Failed to store uploaded document");
        }
    }

    public byte[] load(String storageId) {
        try {
            Path file = resolve(storageId);
            return Files.exists(file) ? Files.readAllBytes(file) : null;
        } catch (IOException e) {
            log.warn("Failed to load SRS file {}: {}", storageId, e.getMessage());
            return null;
        }
    }

    public void delete(String storageId) {
        try {
            Files.deleteIfExists(resolve(storageId));
        } catch (IOException e) {
            log.warn("Failed to delete SRS file {}: {}", storageId, e.getMessage());
        }
    }

    // Rejects any id that isn't a plain UUID, so a stored value can never escape the root
    // directory via path traversal.
    private Path resolve(String storageId) {
        try {
            return root.resolve(UUID.fromString(storageId).toString());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Invalid document reference");
        }
    }
}
