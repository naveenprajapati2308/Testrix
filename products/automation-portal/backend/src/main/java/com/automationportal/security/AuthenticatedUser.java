package com.automationportal.security;

/** Caller identity taken straight from the JWT's claims — this service issues no tokens and
 * keeps no user table of its own, so there is nothing further to look up. */
public record AuthenticatedUser(Long id, String username, String email, String role) {
}
