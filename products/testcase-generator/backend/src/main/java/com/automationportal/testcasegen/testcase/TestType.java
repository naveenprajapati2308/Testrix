package com.automationportal.testcasegen.testcase;

import java.util.Arrays;

public enum TestType {
    FUNCTIONAL,
    NEGATIVE,
    BOUNDARY,
    VALIDATION,
    BUSINESS_RULE,
    WORKFLOW,
    INTEGRATION,
    SECURITY,
    NOTIFICATION,
    ERROR_HANDLING,
    USABILITY,
    COMPATIBILITY;

    /** The model returns free-text labels like "Business Rule" or "error handling"; anything
     *  unrecognised falls back to FUNCTIONAL rather than failing the whole generation. */
    public static TestType from(String raw) {
        if (raw == null || raw.isBlank()) return FUNCTIONAL;
        String normalized = raw.trim().replace(' ', '_').replace('-', '_').toUpperCase();
        return Arrays.stream(values())
                .filter(t -> t.name().equals(normalized))
                .findFirst()
                .orElse(FUNCTIONAL);
    }
}
