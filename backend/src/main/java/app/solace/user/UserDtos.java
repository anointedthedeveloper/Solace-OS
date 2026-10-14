package app.solace.user;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class UserDtos {
    private UserDtos() {}

    public record UserResponse(UUID id, String username, String displayName) {
        public static UserResponse from(User u) {
            return new UserResponse(u.getId(), u.getUsername(), u.getDisplayName());
        }
    }

    public record UpdateProfileRequest(
            @NotNull(message = "Display name is required")
            @Size(max = 40, message = "Display name must be at most 40 characters")
            @Pattern(regexp = "^[^\\p{Cntrl}<>]*$", message = "Display name contains invalid characters")
            String displayName) {}

    public record DeleteAccountRequest(
            @NotNull(message = "Password is required")
            @Size(min = 1, max = 128, message = "Password is required")
            String password) {}
}
