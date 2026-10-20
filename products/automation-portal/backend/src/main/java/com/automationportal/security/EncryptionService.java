package com.automationportal.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

@Service
public class EncryptionService {
    private static final Logger log = LoggerFactory.getLogger(EncryptionService.class);
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12; // 96 bits standard for GCM
    private static final int GCM_TAG_LENGTH = 128; // 128 bits authentication tag

    private final SecretKey secretKey;
    private final SecureRandom secureRandom = new SecureRandom();

    public EncryptionService(@Value("${portal.security.encryption-key:testrix-master-vault-encryption-secret-key-32bytes}") String keyString) {
        this.secretKey = deriveKey(keyString);
    }

    private SecretKey deriveKey(String rawKey) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] keyBytes = digest.digest(rawKey.getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(keyBytes, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to initialize EncryptionService key", e);
        }
    }

    /**
     * Encrypts plaintext string using AES-GCM-256 with a random IV.
     * Output format: Base64(IV + CipherText + Tag)
     */
    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isBlank()) {
            return null;
        }
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, parameterSpec);

            byte[] cipherText = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            ByteBuffer byteBuffer = ByteBuffer.allocate(iv.length + cipherText.length);
            byteBuffer.put(iv);
            byteBuffer.put(cipherText);

            return Base64.getEncoder().encodeToString(byteBuffer.array());
        } catch (Exception e) {
            log.error("Failed to encrypt secret", e);
            throw new RuntimeException("Encryption failure: " + e.getMessage(), e);
        }
    }

    /**
     * Decrypts Base64 payload back to plaintext string.
     */
    public String decrypt(String encryptedBase64) {
        if (encryptedBase64 == null || encryptedBase64.isBlank()) {
            return null;
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(encryptedBase64);
            if (decoded.length < GCM_IV_LENGTH) {
                throw new IllegalArgumentException("Invalid encrypted payload length");
            }

            ByteBuffer byteBuffer = ByteBuffer.wrap(decoded);
            byte[] iv = new byte[GCM_IV_LENGTH];
            byteBuffer.get(iv);

            byte[] cipherText = new byte[byteBuffer.remaining()];
            byteBuffer.get(cipherText);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, parameterSpec);

            byte[] plainTextBytes = cipher.doFinal(cipherText);
            return new String(plainTextBytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("Failed to decrypt secret", e);
            throw new RuntimeException("Decryption failure: " + e.getMessage(), e);
        }
    }

    /**
     * Masks sensitive tokens for safe display in UI (e.g. ghp_1234567890abcdef -> ghp_***cdef).
     */
    public static String maskToken(String token) {
        if (token == null || token.isBlank()) {
            return "";
        }
        if (token.length() <= 8) {
            return "******";
        }
        int prefixLen = Math.min(4, token.length() - 4);
        String prefix = token.substring(0, prefixLen);
        String suffix = token.substring(token.length() - 4);
        return prefix + "****" + suffix;
    }
}
