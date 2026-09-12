package com.testrix.platform.auth;

import com.testrix.platform.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByToken(String token);
    void deleteByUser(User user);
    List<RefreshToken> findByUserAndRevokedFalse(User user);

    @Modifying
    @Query("delete from RefreshToken t where t.revoked = true or t.expiresAt < :cutoff")
    int purgeStale(@Param("cutoff") Instant cutoff);
}
