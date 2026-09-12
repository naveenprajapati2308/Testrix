package com.testrix.platform.users;

import java.time.Instant;

public record UserProfileDto(
    Long id,
    String username,
    String email,
    String displayName,
    String mobileNumber,
    String designation,
    String organization,
    String profileImagePath,
    UserRole role,
    UserStatus status,
    boolean emailVerified,
    Instant createdAt,
    Instant lastLogin
) {
    public static UserProfileDto from(User user) {
        return new UserProfileDto(
            user.getId(),
            user.getUsername(),
            user.getEmail(),
            user.getDisplayName(),
            user.getMobileNumber(),
            user.getDesignation(),
            user.getOrganization(),
            user.getProfileImagePath(),
            user.getRole(),
            user.getStatus(),
            user.isEmailVerified(),
            user.getCreatedAt(),
            user.getLastLogin()
        );
    }
}
