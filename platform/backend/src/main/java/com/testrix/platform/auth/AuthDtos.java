package com.testrix.platform.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class AuthDtos {
    private AuthDtos() {}

    public record OtpVerifyRequest(@Email @NotBlank String email, @NotBlank String otp) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record SelectProjectRequest(@NotNull Long projectId, @NotBlank String refreshToken) {}

    public record LogoutRequest(@NotBlank String refreshToken) {}

    public record ForgotPasswordRequest(@Email @NotBlank String email) {}

    public record ResetPasswordRequest(@Email @NotBlank String email, @NotBlank String otp, @NotBlank String newPassword) {}

    public record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank String newPassword) {}

    public record EmailChangeRequest(@Email @NotBlank String newEmail) {}

    public record EmailChangeVerifyRequest(@Email @NotBlank String newEmail, @NotBlank String otp) {}
}
