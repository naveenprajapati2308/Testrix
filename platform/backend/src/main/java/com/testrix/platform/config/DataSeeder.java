package com.testrix.platform.config;

import com.testrix.platform.users.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String superAdminSeedPassword;
    private final String superAdminEmail;

    public DataSeeder(UserRepository userRepository,
                      PasswordEncoder passwordEncoder,
                      @Value("${portal.superadmin.seed-password}") String superAdminSeedPassword,
                      @Value("${portal.superadmin.email}") String superAdminEmail) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.superAdminSeedPassword = superAdminSeedPassword;
        this.superAdminEmail = superAdminEmail;
    }

    @Override
    public void run(String... args) {
        // The one Super Admin identity, platform-wide (PORTAL_SUPERADMIN_EMAIL — never a
        // hardcoded literal). The existing SUPER_ADMIN role holder (if any) is always preferred
        // over an email/username match, so this reconciles that account's email on restart
        // without ever re-deriving "who is super admin" from an email match alone — an
        // unrelated user whose email happens to collide with a misconfigured
        // PORTAL_SUPERADMIN_EMAIL must never be silently promoted while a real SUPER_ADMIN
        // already exists.
        java.util.Optional<User> existingRoleHolder = userRepository.findAll().stream()
                .filter(u -> u.getRole() == UserRole.SUPER_ADMIN).findFirst();
        java.util.Optional<User> existing = existingRoleHolder
                .or(() -> userRepository.findByUsernameOrEmail(superAdminEmail, superAdminEmail));

        if (existing.isPresent() && existingRoleHolder.isEmpty() && existing.get().getRole() != UserRole.SUPER_ADMIN) {
            log.warn("Promoting existing user (id={}, username={}) to SUPER_ADMIN because it matches " +
                            "PORTAL_SUPERADMIN_EMAIL and no SUPER_ADMIN account currently exists. " +
                            "Verify this is the intended account.",
                    existing.get().getId(), existing.get().getUsername());
        }

        if (existing.isEmpty()) {
            User superAdmin = new User();
            superAdmin.setUsername(superAdminEmail);
            superAdmin.setEmail(superAdminEmail);
            superAdmin.setDisplayName("Super Admin");
            superAdmin.setRole(UserRole.SUPER_ADMIN);
            superAdmin.setStatus(UserStatus.ACTIVE);
            superAdmin.setEmailVerified(true);
            superAdmin.setAuthProvider("LOCAL");
            // Only applied on first-ever creation — an existing account's password is never
            // touched by this seeder, so this doesn't reset anything on restart.
            superAdmin.setPasswordHash(passwordEncoder.encode(superAdminSeedPassword));
            userRepository.save(superAdmin);
        } else {
            existing.ifPresent(superAdmin -> {
                boolean changed = false;
                if (!superAdminEmail.equals(superAdmin.getUsername())) {
                    superAdmin.setUsername(superAdminEmail);
                    changed = true;
                }
                if (!superAdminEmail.equals(superAdmin.getEmail())) {
                    superAdmin.setEmail(superAdminEmail);
                    changed = true;
                }
                if (superAdmin.getRole() != UserRole.SUPER_ADMIN) {
                    superAdmin.setRole(UserRole.SUPER_ADMIN);
                    changed = true;
                }
                if (!superAdmin.isEmailVerified() || superAdmin.getStatus() != UserStatus.ACTIVE) {
                    superAdmin.setEmailVerified(true);
                    superAdmin.setStatus(UserStatus.ACTIVE);
                    changed = true;
                }
                if (changed) userRepository.save(superAdmin);
            });
        }
    }
}
