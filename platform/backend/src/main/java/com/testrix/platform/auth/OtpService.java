package com.testrix.platform.auth;

import com.testrix.platform.mail.MailService;
import com.testrix.platform.security.RateLimiter;
import com.testrix.platform.security.TooManyAttemptsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;

@Service
public class OtpService {
    private static final int OTP_EXPIRY_MINUTES = 10;
    // A 6-digit code is only a million guesses. The per-IP filter alone does not bound this —
    // an attacker spreading guesses across addresses still gets unlimited tries at one code —
    // so attempts are also counted per (email, purpose), which cannot be rotated.
    private static final int MAX_VERIFY_ATTEMPTS = 5;
    private static final int VERIFY_WINDOW_SECONDS = OTP_EXPIRY_MINUTES * 60;
    private static final int VERIFY_LOCKOUT_SECONDS = 15 * 60;

    private final OtpVerificationRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final RateLimiter rateLimiter;
    private final SecureRandom random = new SecureRandom();

    public OtpService(OtpVerificationRepository repository, PasswordEncoder passwordEncoder, MailService mailService,
                      RateLimiter rateLimiter) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.mailService = mailService;
        this.rateLimiter = rateLimiter;
    }

    /**
     * Generates, persists, and emails an OTP. The raw OTP is returned only so a caller can
     * correlate it in a test; it must never be put in an API response, which would hand the
     * code to whoever asked for it rather than to the mailbox owner.
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
        String attemptKey = "otp:" + purpose + ":" + (email == null ? "" : email.trim().toLowerCase());
        long retryAfter = rateLimiter.retryAfterSeconds(
                attemptKey, MAX_VERIFY_ATTEMPTS, VERIFY_WINDOW_SECONDS, VERIFY_LOCKOUT_SECONDS);
        if (retryAfter > 0) {
            throw new TooManyAttemptsException("Too many incorrect codes. Request a new one in "
                    + RateLimiter.humanDuration(retryAfter) + ".", retryAfter);
        }
        OtpVerification verification = repository.findTopByEmailAndPurposeAndVerifiedFalseOrderByIdDesc(email, purpose)
            .orElseThrow(() -> new IllegalArgumentException("OTP not found"));
        if (verification.getExpiresAt().isBefore(Instant.now()) || !passwordEncoder.matches(otp, verification.getOtpCode())) {
            throw new IllegalArgumentException("Invalid or expired OTP");
        }
        verification.setVerified(true);
        repository.save(verification);
        rateLimiter.reset(attemptKey);
    }
}
