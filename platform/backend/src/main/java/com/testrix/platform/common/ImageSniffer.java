package com.testrix.platform.common;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * Identifies an uploaded file's real image type from its magic bytes. Never trust the
 * client-supplied Content-Type or filename extension — both are attacker-controlled (a spoofed
 * "image/png" header on an .html/.svg payload is a stored-XSS path once served back from
 * /uploads/**).
 */
public final class ImageSniffer {
    private ImageSniffer() {}

    /** Returns the file extension (with leading dot) for a real PNG/JPEG/GIF/WEBP, or null. */
    public static String sniffExtension(MultipartFile file) throws IOException {
        byte[] header = new byte[12];
        int read;
        try (var in = file.getInputStream()) {
            read = in.readNBytes(header, 0, header.length);
        }
        if (read >= 8 && (header[0] & 0xFF) == 0x89 && header[1] == 'P' && header[2] == 'N' && header[3] == 'G'
                && header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A) {
            return ".png";
        }
        if (read >= 3 && (header[0] & 0xFF) == 0xFF && (header[1] & 0xFF) == 0xD8 && (header[2] & 0xFF) == 0xFF) {
            return ".jpg";
        }
        if (read >= 6 && header[0] == 'G' && header[1] == 'I' && header[2] == 'F' && header[3] == '8'
                && (header[4] == '7' || header[4] == '9') && header[5] == 'a') {
            return ".gif";
        }
        if (read >= 12 && header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F'
                && header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P') {
            return ".webp";
        }
        return null;
    }
}
