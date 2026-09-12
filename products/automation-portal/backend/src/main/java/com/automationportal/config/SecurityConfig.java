package com.automationportal.config;

import com.automationportal.security.JwtValidationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * This product issues no tokens and owns no user table — login lives in the platform service.
 * {@link JwtValidationFilter} verifies its JWTs locally against the shared secret, which is what
 * keeps automation serving traffic while the platform service is down.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    private final JwtValidationFilter jwtValidationFilter;

    public SecurityConfig(JwtValidationFilter jwtValidationFilter) {
        this.jwtValidationFilter = jwtValidationFilter;
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
                    "/error"
                ).permitAll()
                .requestMatchers("/api/admin/**").hasRole("SUPER_ADMIN")
                // /api/environments returns a configJson-stripped DTO, and its writes are
                // project-scoped inside EnvironmentController — which is what makes falling
                // through to .anyRequest().authenticated() safe instead of a blanket role rule.
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtValidationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    // Origins come from CORS_ALLOWED_ORIGINS so a production domain needs no code change.
    // Falls back to the dev list when blank OR unset — Compose passes blank through as an
    // empty string, which Spring's ${X:default} does not cover.
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
