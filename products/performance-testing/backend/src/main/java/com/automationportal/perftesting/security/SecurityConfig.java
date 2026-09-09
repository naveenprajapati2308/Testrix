package com.automationportal.perftesting.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * The gateway already forwards the client's original Authorization header through untouched
 * (see gateway/nginx.conf's /perf/api/ location) — this only adds real enforcement so hitting
 * this service's port directly (bypassing the gateway) isn't an unauthenticated bypass
 * anymore. Stateless: no login/session of its own, JwtValidationFilter just validates the
 * token automation-portal already issued. OPTIONS is permitted unconditionally so this
 * doesn't break preflight handling now that CORS is centralized here (see
 * corsConfigurationSource() below) instead of a bare, allow-all @CrossOrigin per controller.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    private final JwtValidationFilter jwtValidationFilter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SecurityConfig(JwtValidationFilter jwtValidationFilter) {
        this.jwtValidationFilter = jwtValidationFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(Customizer.withDefaults())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated())
            .exceptionHandling(eh -> eh.authenticationEntryPoint(this::unauthorized))
            .addFilterBefore(jwtValidationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    // Replaces the bare, allow-all @CrossOrigin that used to sit on 10 separate controllers —
    // those reflected every origin with no allow-list at all. Same env-driven pattern (and the
    // same blank-vs-unset handling) as automation-portal's SecurityConfig.
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

    private void unauthorized(jakarta.servlet.http.HttpServletRequest request, HttpServletResponse response,
                               org.springframework.security.core.AuthenticationException ex) throws java.io.IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        objectMapper.writeValue(response.getWriter(), Map.of(
                "timestamp", Instant.now().toString(),
                "status", 401,
                "message", "Missing or invalid authentication token"));
    }
}
