package app.solace.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AuthDtos {
    private AuthDtos() {}

    public record RegisterRequest(
            @NotNull(message = "Username is required")
            @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$", message = "Username must be 3–32 characters: letters, numbers, dot, dash or underscore")
            String username,

            @NotNull(message = "Password is required")
            @Size(min = 10, max = 72, message = "Password must be between 10 and 72 characters")
            String password,

            @Size(max = 40, message = "Display name must be at most 40 characters")
            @Pattern(regexp = "^[^\\p{Cntrl}<>]*$", message = "Display name contains invalid characters")
            String displayName) {}

    public record LoginRequest(
            @NotBlank(message = "Username is required") @Size(max = 32, message = "Username is too long") String username,
            @NotBlank(message = "Password is required") @Size(max = 128, message = "Password is too long") String password) {}
}
