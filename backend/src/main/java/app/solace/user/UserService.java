package app.solace.user;

import app.solace.common.ApiException;
import app.solace.user.UserDtos.UserResponse;
import java.time.Clock;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {
    private static final Logger log = LoggerFactory.getLogger(UserService.class);
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final Clock clock;

    public UserService(UserRepository users, PasswordEncoder encoder, Clock clock) {
        this.users = users;
        this.encoder = encoder;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public UserResponse get(UUID id) {
        return users.findById(id).map(UserResponse::from).orElseThrow(() -> ApiException.unauthorized("Authentication required"));
    }

    @Transactional
    public UserResponse updateDisplayName(UUID id, String displayName) {
        User u = users.findById(id).orElseThrow(() -> ApiException.unauthorized("Authentication required"));
        u.setDisplayName(displayName.trim(), clock.instant());
        return UserResponse.from(u);
    }

    @Transactional
    public void deleteAccount(UUID id, String password) {
        User u = users.findById(id).orElseThrow(() -> ApiException.unauthorized("Authentication required"));
        if (!encoder.matches(password, u.getPasswordHash())) throw ApiException.badRequest("Password is incorrect");
        users.delete(u); // all owned rows are removed by ON DELETE CASCADE
        log.info("Account deleted: {}", id);
    }
}
