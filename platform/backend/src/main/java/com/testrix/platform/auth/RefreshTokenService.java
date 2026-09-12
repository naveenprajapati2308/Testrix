package com.testrix.platform.auth;

import com.testrix.platform.users.User;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class RefreshTokenService {
    private final RefreshTokenRepository repository;
    private final long refreshDays;

    public RefreshTokenService(RefreshTokenRepository repository,
                               @Value("${portal.jwt.refresh-expiration-days}") long refreshDays) {
        this.repository = repository;
        this.refreshDays = refreshDays;
    }

    public RefreshToken create(User user, boolean rememberMe) {
        RefreshToken token = new RefreshToken();
        token.setUser(user);
        token.setToken(UUID.randomUUID().toString() + UUID.randomUUID());
        token.setExpiresAt(Instant.now().plusSeconds((rememberMe ? refreshDays * 2 : refreshDays) * 86400));
        return repository.save(token);
    }

    @Transactional
    public RefreshToken rotate(String rawToken) {
        RefreshToken current = repository.findByToken(rawToken)
            .orElseThrow(() -> new IllegalArgumentException("Invalid refresh token"));
        if (current.isRevoked() || current.getExpiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("Refresh token expired or revoked");
        }
        RefreshToken next = create(current.getUser(), false);
        current.setRevoked(true);
        current.setReplacedBy(next.getToken());
        return next;
    }

    @Transactional
    public void revoke(String rawToken) {
        repository.findByToken(rawToken).ifPresent(token -> {
            token.setRevoked(true);
            repository.save(token);
        });
    }

    @Transactional
    public void revokeActiveTokensFor(User user) {
        List<RefreshToken> active = repository.findByUserAndRevokedFalse(user);
        active.forEach(token -> token.setRevoked(true));
        repository.saveAll(active);
    }

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void purgeStaleTokens() {
        repository.purgeStale(Instant.now());
    }
}
