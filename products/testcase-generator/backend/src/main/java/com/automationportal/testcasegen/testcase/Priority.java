package com.automationportal.testcasegen.testcase;

import java.util.Arrays;

public enum Priority {
    HIGH,
    MEDIUM,
    LOW;

    /** Null when the SRS didn't state a priority — the prompt asks the model not to invent one,
     *  so an unrecognised value stays null rather than being guessed. */
    public static Priority from(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String normalized = raw.trim().toUpperCase();
        return Arrays.stream(values())
                .filter(p -> p.name().equals(normalized))
                .findFirst()
                .orElse(null);
    }
}
