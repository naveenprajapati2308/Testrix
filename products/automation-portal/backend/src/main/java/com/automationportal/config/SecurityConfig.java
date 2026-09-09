package com.automationportal.config;

import com.automationportal.auth.GoogleOAuth2SuccessHandler;
import com.automationportal.auth.JwtAuthenticationFilter;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler;
    private final ObjectProvider<ClientRegistrationRepository> clientRegistrationRepository;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler,
                          ObjectProvider<ClientRegistrationRepository> clientRegistrationRepository) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.googleOAuth2SuccessHandler = googleOAuth2SuccessHandler;
        this.clientRegistrationRepository = clientRegistrationRepository;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(Customizer.withDefaults())
            .exceptionHandling(exception -> exception.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/api/auth/login",
                    "/api/auth/refresh",
                    "/api/auth/select-project",
                    "/api/auth/forgot-password",
                    "/api/auth/reset-password",
                    "/api/auth/google/login-url",
                    "/api/workspace-requests",
                    "/api/workspace-requests/send-otp",
                    "/api/workspace-requests/verify-otp",
                    "/oauth2/**",
                    "/login/oauth2/**",
                    "/uploads/**",
                    // Report files open via plain <a> links (no Authorization header).
                    // These only redirect to / stream files already public under /uploads/**.
                    "/api/reports/*/view",
                    "/api/reports/*/download",
                    "/api/reports/*/testng-results",
                    "/actuator/health",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html",
                    "/api/events/execution",
                    "/api/executions/*/state",
                    "/api/executions/*/job-finished",
                    // Called by the registered engine process itself (X-API-Key, not a user
                    // JWT) — self-validated inside TestEngineController, same pattern as
                    // /api/events/execution above.
                    "/api/test-engines/*/heartbeat",
                    // Called by api-testing-backend (execution reports), not a user JWT —
                    // self-validated with X-API-Key inside InternalMailController, same pattern
                    // as /api/events/execution above.
                    "/api/internal/reports/mail",
                    "/error"
                ).permitAll()
                .requestMatchers("/api/admin/**").hasRole("SUPER_ADMIN")
                // /api/environments (GET, plain list) stays open to any authenticated user —
                // it's a configJson-stripped DTO now (EnvironmentSummaryDto), used broadly for
                // dropdown/selector data.
                //
                // /api/environments/health used to be a blanket SUPER_ADMIN-only rule here, back
                // when EnvironmentHealthService did an unscoped findAll() across every project —
                // genuinely unsafe to open to project users as-is, so locking it down was correct
                // at the time. It's now scoped to the caller's own project inside
                // EnvironmentController/EnvironmentHealthService (same pattern as the POST/PUT/
                // DELETE methods below), which is what makes it safe to fall through to
                // .anyRequest().authenticated() — a Project Admin's own Environments page was
                // 403ing on this before that scoping existed.
                //
                // POST/PUT/DELETE /api/environments/** used to be a blanket SUPER_ADMIN-only rule
                // here; Phase 4 (Workspace Settings) lets a project's own Project Admin manage
                // their own project's environments too, so authorization moved into
                // EnvironmentController itself (ProjectContextHolder-based, same pattern as
                // ProjectUserController) rather than staying a platform-role path rule.
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        if (clientRegistrationRepository.getIfAvailable() != null) {
            http.oauth2Login(oauth -> oauth.successHandler(googleOAuth2SuccessHandler));
        }
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // Origins list comes from cors.allowed-origins (CORS_ALLOWED_ORIGINS env var) instead of a
    // hardcoded literal, so a real production domain can be added without a code change. Falls
    // back to this same dev-origins list whenever the property is blank OR unset — Compose
    // passes it through as an empty string when .env leaves it blank, and Spring's own
    // ${X:default} placeholder only covers "unset", not "empty".
    private static final List<String> DEFAULT_CORS_ORIGINS = List.of(
            "http://localhost:15000", "http://localhost:5173", "http://localhost:5170",
            "http://localhost:15173", "http://localhost:3000");

    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${cors.allowed-origins:}") String allowedOrigins) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins == null || allowedOrigins.isBlank()
                ? DEFAULT_CORS_ORIGINS
                : Arrays.stream(allowedOrigins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
