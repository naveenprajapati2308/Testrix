package com.testrix.platform.profile;

public final class ProfileDtos {
    private ProfileDtos() {}

    public record UpdateProfileRequest(
        String fullName,
        String mobileNumber,
        String designation,
        String organization,
        String profileImagePath
    ) {}
}
