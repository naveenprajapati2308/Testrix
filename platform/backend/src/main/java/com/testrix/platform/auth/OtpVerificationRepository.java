package com.testrix.platform.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OtpVerificationRepository extends JpaRepository<OtpVerification, Long> {
    Optional<OtpVerification> findTopByEmailAndPurposeAndVerifiedFalseOrderByIdDesc(String email, OtpPurpose purpose);

    boolean existsByEmailAndPurposeAndVerifiedTrue(String email, OtpPurpose purpose);
}
