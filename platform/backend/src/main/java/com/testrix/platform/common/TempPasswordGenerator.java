package com.testrix.platform.common;

import java.util.UUID;

/**
 * Generates one-time temporary passwords for accounts the platform creates on a user's behalf
 * (workspace provisioning, project onboarding) so the resulting password can be emailed to them.
 */
public final class TempPasswordGenerator {
    private TempPasswordGenerator() {}

    public static String generate() {
        // Guarantees upper/lower/digit/special-char coverage (matches AuthController's password
        // policy) regardless of what the random UUID segment happens to contain.
        String randomPart = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        return "Tx1!" + randomPart;
    }
}
