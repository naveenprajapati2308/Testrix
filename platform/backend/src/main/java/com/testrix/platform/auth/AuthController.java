package com.testrix.platform.auth;

import com.testrix.platform.mail.MailService;
import com.testrix.platform.audit.AuditAction;
import com.testrix.platform.audit.AuditService;
import com.testrix.platform.common.ApiResponse;
import com.testrix.platform.security.RateLimiter;
import com.testrix.platform.security.TooManyAttemptsException;
import com.testrix.platform.users.*;
import com.testrix.platform.workspace.ProjectDtos;
import com.testrix.platform.workspace.ProjectResolutionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final OtpService otpService;
    private final AuthenticatedUserService authenticatedUserService;
    private final AuditService auditService;
    private final ProjectResolutionService projectResolutionService;
    private final MailService mailService;
    private final RateLimiter rateLimiter;
    private final int accountMaxAttempts;
    private final int accountWindowSeconds;
    private final int accountLockoutSeconds;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
                          RefreshTokenService refreshTokenService, OtpService otpService,
                          AuthenticatedUserService authenticatedUserService, AuditService auditService,
                          ProjectResolutionService projectResolutionService, MailService mailService,
                          RateLimiter rateLimiter,
                          @Value("${security.rate-limit.account.max-attempts:20}") int accountMaxAttempts,
                          @Value("${security.rate-limit.account.window-seconds:3600}") int accountWindowSeconds,
                          @Value("${security.rate-limit.account.lockout-seconds:3600}") int accountLockoutSeconds) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.otpService = otpService;
        this.authenticatedUserService = authenticatedUserService;
        this.auditService = auditService;
        this.projectResolutionService = projectResolutionService;
        this.mailService = mailService;
        this.rateLimiter = rateLimiter;
        this.accountMaxAttempts = accountMaxAttempts;
        this.accountWindowSeconds = accountWindowSeconds;
        this.accountLockoutSeconds = accountLockoutSeconds;
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        // Counted per submitted identifier, which — unlike the client IP the filter throttles —
        // an attacker cannot rotate, so one account can't be ground down from a botnet.
        String accountKey = "account:" + request.username().trim().toLowerCase();
        long retryAfter = rateLimiter.retryAfterSeconds(
                accountKey, accountMaxAttempts, accountWindowSeconds, accountLockoutSeconds);
        if (retryAfter > 0) {
            log.warn("Login hold on account {} — {}s remaining", request.username(), retryAfter);
            throw new TooManyAttemptsException("Too many failed sign-in attempts. For security, this account is "
                    + "paused for " + RateLimiter.humanDuration(retryAfter) + ". It is not blocked: you can sign in "
                    + "again after that, or reset your password now.", retryAfter);
        }
        User user = userRepository.findByUsernameOrEmail(request.username(), request.username()).orElse(null);
        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            auditService.record(user, AuditAction.FAILED_LOGIN, "Invalid username or password", servletRequest);
            throw new IllegalArgumentException("Invalid username or password");
        }
        rateLimiter.reset(accountKey);
        if (user.getStatus() != UserStatus.ACTIVE || !user.isEmailVerified()) {
            throw new IllegalArgumentException("Account is not active or email is not verified");
        }
        user.setLastLogin(Instant.now());
        userRepository.save(user);
        refreshTokenService.revokeActiveTokensFor(user);
        RefreshToken refreshToken = refreshTokenService.create(user, request.rememberMe());
        auditService.record(user, AuditAction.LOGIN, "User logged in", servletRequest);
        return ApiResponse.ok(buildSessionResponse(user, refreshToken.getToken()));
    }

    // @Transactional so a failure after rotate() rolls the rotation back too — otherwise the
    // caller's old refresh token is burned with no new one returned.
    @PostMapping("/refresh")
    @Transactional
    public ApiResponse<LoginResponse> refresh(@Valid @RequestBody AuthDtos.RefreshRequest request) {
        RefreshToken refreshToken = refreshTokenService.rotate(request.refreshToken());
        User user = refreshToken.getUser();
        return ApiResponse.ok(buildSessionResponse(user, refreshToken.getToken()));
        
    }

    /** Called once the user picks a project, after login/refresh returned needsProjectSelection,
     *  or to switch projects mid-session. */
    @PostMapping("/select-project")
    @Transactional
    public ApiResponse<LoginResponse> selectProject(@Valid @RequestBody AuthDtos.SelectProjectRequest request) {
        RefreshToken refreshToken = refreshTokenService.rotate(request.refreshToken());
        User user = refreshToken.getUser();
        boolean isMember = projectResolutionService.activeProjects(user.getId()).stream()
            .anyMatch(rp -> rp.project().getId().equals(request.projectId()));
        if (!isMember) {
            throw new IllegalArgumentException("You are not a member of that project");
        }
        user.setCurrentProjectId(request.projectId());
        userRepository.save(user);
        return ApiResponse.ok(buildSessionResponse(user, refreshToken.getToken()));
    }

    @GetMapping("/my-projects")
    public ApiResponse<List<ProjectDtos.MyProjectSummary>> myProjects() {
        User user = authenticatedUserService.currentUser();
        return ApiResponse.ok(projectResolutionService.activeProjects(user.getId()).stream()
            .map(projectResolutionService::toSummary).toList());
    }

    /** Super Admin never has a project. One active project auto-selects; several prefer the last
     *  selected one if still valid, else needsProjectSelection=true so the shell shows a picker. */
    private LoginResponse buildSessionResponse(User user, String refreshTokenValue) {
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            return LoginResponse.simple(jwtService.createAccessToken(user), refreshTokenValue, UserProfileDto.from(user));
        }
        List<ProjectResolutionService.ResolvedProject> projects = projectResolutionService.activeProjects(user.getId());
        if (projects.isEmpty()) {
            throw new IllegalArgumentException(projectResolutionService.hasAnySuspendedMembership(user.getId())
                ? "Your workspace has been suspended. Contact your administrator."
                : "Your account is not assigned to any workspace. Contact your administrator.");
        }
        if (projects.size() == 1) {
            return withProjectResponse(user, refreshTokenValue, projects.get(0));
        }
        Optional<ProjectResolutionService.ResolvedProject> preferred = user.getCurrentProjectId() == null
            ? Optional.empty()
            : projects.stream().filter(rp -> rp.project().getId().equals(user.getCurrentProjectId())).findFirst();
        if (preferred.isPresent()) {
            return withProjectResponse(user, refreshTokenValue, preferred.get());
        }
        List<ProjectDtos.MyProjectSummary> summaries = projects.stream().map(projectResolutionService::toSummary).toList();
        return LoginResponse.pendingSelection(jwtService.createAccessToken(user), refreshTokenValue, UserProfileDto.from(user), summaries);
    }

    private LoginResponse withProjectResponse(User user, String refreshTokenValue, ProjectResolutionService.ResolvedProject resolved) {
        user.setCurrentProjectId(resolved.project().getId());
        userRepository.save(user);
        String token = jwtService.createProjectAccessToken(user, projectResolutionService.toContext(resolved));
        return LoginResponse.withProject(token, refreshTokenValue, UserProfileDto.from(user), projectResolutionService.toSummary(resolved));
    }

    @PostMapping("/logout")
    public ApiResponse<Map<String, String>> logout(@Valid @RequestBody AuthDtos.LogoutRequest request, HttpServletRequest servletRequest) {
        refreshTokenService.revoke(request.refreshToken());
        User user = authenticatedUserService.currentUser();
        auditService.record(user, AuditAction.LOGOUT, "User logged out", servletRequest);
        return ApiResponse.ok(Map.of("status", "logged_out"));
    }

    @GetMapping("/me")
    public ApiResponse<UserProfileDto> me() {
        return ApiResponse.ok(UserProfileDto.from(authenticatedUserService.currentUser()));
    }

    @PostMapping("/forgot-password")
    public ApiResponse<Map<String, String>> forgotPassword(@Valid @RequestBody AuthDtos.ForgotPasswordRequest request, HttpServletRequest servletRequest) {
        User user = userRepository.findByEmail(request.email()).orElseThrow(() -> new IllegalArgumentException("Email not found"));
        otpService.send(user.getUsername(), user.getEmail(), OtpPurpose.FORGOT_PASSWORD);
        auditService.record(user, AuditAction.OTP_SENT, "Forgot password OTP sent", servletRequest);
        return ApiResponse.ok(Map.of("status", "otp_sent"));
    }

    @PostMapping("/reset-password")
    public ApiResponse<Map<String, String>> resetPassword(@Valid @RequestBody AuthDtos.ResetPasswordRequest request, HttpServletRequest servletRequest) {
        validatePassword(request.newPassword());
        otpService.verify(request.email(), request.otp(), OtpPurpose.FORGOT_PASSWORD);
        User user = userRepository.findByEmail(request.email()).orElseThrow();
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
        auditService.record(user, AuditAction.PASSWORD_RESET, "Password reset completed", servletRequest);
        notifyPasswordChanged(user);
        return ApiResponse.ok(Map.of("status", "password_reset"));
    }

    @PostMapping("/change-password")
    public ApiResponse<Map<String, String>> changePassword(@Valid @RequestBody AuthDtos.ChangePasswordRequest request, HttpServletRequest servletRequest) {
        validatePassword(request.newPassword());
        User user = authenticatedUserService.currentUser();
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
        auditService.record(user, AuditAction.PASSWORD_CHANGE, "Password changed", servletRequest);
        notifyPasswordChanged(user);
        return ApiResponse.ok(Map.of("status", "password_changed"));
    }

    @GetMapping("/google/login-url")
    public ApiResponse<Map<String, String>> googleLoginUrl() {
        return ApiResponse.ok(Map.of(
            "loginUrl", "/oauth2/authorization/google",
            "note", "Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google OAuth2 login"
        ));
    }

    // A password-change mail hiccup must never undo (or fail to report) a password that has
    // already been changed — same swallow-and-continue pattern as WorkspaceProvisioningService's
    // approval email.
    private void notifyPasswordChanged(User user) {
        try {
            mailService.sendPasswordChanged(user.getEmail(), user.getUsername());
        } catch (RuntimeException ex) {
            log.warn("password-changed notification failed for {}: {}", user.getUsername(), ex.getMessage());
        }
    }

    private void validatePassword(String password) {
        if (password.length() < 8
            || !password.matches(".*[A-Z].*")
            || !password.matches(".*[a-z].*")
            || !password.matches(".*\\d.*")
            || !password.matches(".*[^A-Za-z0-9].*")) {
            throw new IllegalArgumentException("Password must be 8+ chars with uppercase, lowercase, number, and special character");
        }
    }
}
