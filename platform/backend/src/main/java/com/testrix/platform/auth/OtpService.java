package com.testrix.platform.auth;

import com.testrix.platform.mail.MailService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;

@Service
public class OtpService {
    private static final int OTP_EXPIRY_MINUTES = 10;

    private final OtpVerificationRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final SecureRandom random = new SecureRandom();

    public OtpService(OtpVerificationRepository repository, PasswordEncoder passwordEncoder, MailService mailService) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.mailService = mailService;
    }

    /**
     * Generates, persists, and (optionally) emails an OTP.
     * Returns the raw OTP so callers can include it in the API response
     * for static display in the UI (dev/console mode with no SMTP required).
     */
    public String send(String username, String email, OtpPurpose purpose) {
        String otp = String.valueOf(100000 + random.nextInt(900000));
        OtpVerification verification = new OtpVerification();
        verification.setUsername(username);
        verification.setEmail(email);
        verification.setPurpose(purpose);
        verification.setOtpCode(passwordEncoder.encode(otp));
        verification.setExpiresAt(Instant.now().plusSeconds(OTP_EXPIRY_MINUTES * 60L));
        repository.save(verification);
        mailService.sendOtp(email, otp, purpose, OTP_EXPIRY_MINUTES);
        return otp;
    }

    public void verify(String email, String otp, OtpPurpose purpose) {
        OtpVerification verification = repository.findTopByEmailAndPurposeAndVerifiedFalseOrderByIdDesc(email, purpose)
            .orElseThrow(() -> new IllegalArgumentException("OTP not found"));
        if (verification.getExpiresAt().isBefore(Instant.now()) || !passwordEncoder.matches(otp, verification.getOtpCode())) {
            throw new IllegalArgumentException("Invalid or expired OTP");
        }
        verification.setVerified(true);
        repository.save(verification);
    }
}
