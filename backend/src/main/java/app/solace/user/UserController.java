package app.solace.user;

import app.solace.security.AuthenticatedUser;
import app.solace.user.UserDtos.DeleteAccountRequest;
import app.solace.user.UserDtos.UpdateProfileRequest;
import app.solace.user.UserDtos.UserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/me")
public class UserController {
    private final UserService users;

    public UserController(UserService users) {
        this.users = users;
    }

    @PatchMapping
    public UserResponse updateProfile(@AuthenticationPrincipal AuthenticatedUser me, @Valid @RequestBody UpdateProfileRequest req) {
        return users.updateDisplayName(me.id(), req.displayName());
    }

    /** Permanently deletes the account and everything it owns. Requires re-entering the password. */
    @DeleteMapping
    public ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal AuthenticatedUser me, @Valid @RequestBody DeleteAccountRequest req, HttpServletRequest http) {
        users.deleteAccount(me.id(), req.password());
        var session = http.getSession(false);
        if (session != null) session.invalidate();
        return ResponseEntity.noContent().build();
    }
}
