package app.solace.security;

import java.io.Serializable;
import java.util.UUID;

/** What we keep in the HTTP session: just an id and a username — never the password hash. */
public record AuthenticatedUser(UUID id, String username) implements Serializable {}
