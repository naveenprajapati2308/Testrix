package com.testrix.platform.auth;

public enum OtpPurpose {
    REGISTRATION(
        "Verify your Testrix account",
        "Enter this code to verify your email and finish creating your Testrix account.",
        "Verify your Testrix account"
    ),
    EMAIL_CHANGE(
        "Confirm your new email address",
        "Enter this code to confirm this is your new Testrix account email.",
        "Confirm your Testrix email address"
    ),
    FORGOT_PASSWORD(
        "Reset your Testrix password",
        "Enter this code to reset your Testrix account password.",
        "Reset your Testrix password"
    );

    private final String heading;
    private final String intro;
    private final String subject;

    OtpPurpose(String heading, String intro, String subject) {
        this.heading = heading;
        this.intro = intro;
        this.subject = subject;
    }

    public String heading() {
        return heading;
    }

    public String intro() {
        return intro;
    }

    public String subject() {
        return subject;
    }
}
