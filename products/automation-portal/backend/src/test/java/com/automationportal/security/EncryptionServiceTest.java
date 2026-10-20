package com.automationportal.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class EncryptionServiceTest {

    private EncryptionService encryptionService;

    @BeforeEach
    void setUp() {
        encryptionService = new EncryptionService("test-secret-encryption-key-for-testrix-32bytes");
    }

    @Test
    void testEncryptAndDecryptRoundTrip() {
        String originalToken = "ghp_1234567890abcdefABCDEF1234567890";
        String encrypted = encryptionService.encrypt(originalToken);

        assertNotNull(encrypted, "Encrypted string should not be null");
        assertNotEquals(originalToken, encrypted, "Ciphertext must not match original plaintext");

        String decrypted = encryptionService.decrypt(encrypted);
        assertEquals(originalToken, decrypted, "Decrypted text must match the original token exactly");
    }

    @Test
    void testRandomIvProducesDifferentCiphertexts() {
        String token = "ghp_static_token_value_12345";
        String encrypted1 = encryptionService.encrypt(token);
        String encrypted2 = encryptionService.encrypt(token);

        assertNotEquals(encrypted1, encrypted2, "Two encryptions of the same plaintext must use different IVs");
        assertEquals(token, encryptionService.decrypt(encrypted1));
        assertEquals(token, encryptionService.decrypt(encrypted2));
    }

    @Test
    void testNullAndBlankHandling() {
        assertNull(encryptionService.encrypt(null));
        assertNull(encryptionService.encrypt("   "));
        assertNull(encryptionService.decrypt(null));
        assertNull(encryptionService.decrypt("   "));
    }

    @Test
    void testTokenMasking() {
        assertEquals("ghp_****7890", EncryptionService.maskToken("ghp_1234567890"));
        assertEquals("******", EncryptionService.maskToken("short"));
        assertEquals("", EncryptionService.maskToken(null));
        assertEquals("", EncryptionService.maskToken(""));
    }
}
