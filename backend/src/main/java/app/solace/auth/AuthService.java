package app.solace.auth;

import app.solace.auth.AuthDtos.LoginRequest;
import app.solace.auth.AuthDtos.RegisterRequest;
import app.solace.common.ApiException;
import app.solace.common.TooManyRequestsException;
import app.solace.config.AppProperties;
import app.solace.ratelimit.SlidingWindowRateLimiter;
import app.solace.security.AuthenticatedUser;
import app.solace.user.User;
import app.solace.user.UserDtos.UserResponse;
import app.solace.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registration and login. Passwords are hashed with BCrypt; authentication attempts are rate limited
 * per client address and per username; responses never reveal whether a username exists on login.
 */
@Service
public class AuthService {
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    /** A few of the most common passwords; a real deployment can plug in a breached-password check. */
    private static final Set<String> COMMON = Set.of("password12", "1234567890", "qwertyuiop", "password123", "1q2w3e4r5t", "iloveyou12", "0123456789", "abcdefghij", "letmein123", "solace12345");

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final Clock clock;
    private final SlidingWindowRateLimiter loginIp;
    private final SlidingWindowRateLimiter loginFailures;
    private final SlidingWindowRateLimiter registerIp;
    /** Verified against when the username is unknown, so response time doesn't reveal which usernames exist. */
    private final String dummyHash;

    public AuthService(UserRepository users, PasswordEncoder encoder, Clock clock, AppProperties props) {
        this.users = users;
        this.encoder = encoder;
        this.clock = clock;
        Duration window = Duration.ofSeconds(props.getRateLimit().getWindowSeconds());
        this.loginIp = new SlidingWindowRateLimiter(props.getRateLimit().getLoginPerIp(), window, clock);
        this.loginFailures = new SlidingWindowRateLimiter(props.getRateLimit().getLoginFailuresPerUser(), window, clock);
        this.registerIp = new SlidingWindowRateLimiter(props.getRateLimit().getRegisterPerIp(), window, clock);
        this.dummyHash = encoder.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public AuthenticatedUser register(RegisterRequest req, String clientIp) {
        if (!registerIp.tryAcquire(clientIp)) throw new TooManyRequestsException(registerIp.retryAfterSeconds(clientIp));
        String username = req.username().trim();
        validatePassword(req.password(), username);
        String lower = username.toLowerCase(Locale.ROOT);
        if (users.existsByUsernameLower(lower)) throw ApiException.conflict("That username is already taken");
        String display = req.displayName() == null || req.displayName().isBlank() ? username : req.displayName().trim();
        User user = new User(UUID.randomUUID(), username, display, encoder.encode(req.password()), clock.instant());
        try {
            users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) { // lost a race on the unique index
            throw ApiException.conflict("That username is already taken");
        }
        log.info("Account registered: {}", user.getId());
        return new AuthenticatedUser(user.getId(), user.getUsername());
    }

    @Transactional(readOnly = true)
    public AuthenticatedUser login(LoginRequest req, String clientIp) {
        String lower = req.username().trim().toLowerCase(Locale.ROOT);
        if (!loginIp.tryAcquire(clientIp)) throw new TooManyRequestsException(loginIp.retryAfterSeconds(clientIp));
        if (loginFailures.isBlocked(lower)) throw new TooManyRequestsException(loginFailures.retryAfterSeconds(lower));

        User user = users.findByUsernameLower(lower).orElse(null);
        boolean ok = encoder.matches(req.password(), user != null ? user.getPasswordHash() : dummyHash) && user != null;
        if (!ok) {
            loginFailures.record(lower);
            log.info("Failed login attempt"); // deliberately no username or password in logs
            throw ApiException.unauthorized("Invalid username or password");
        }
        loginFailures.reset(lower);
        return new AuthenticatedUser(user.getId(), user.getUsername());
    }

    @Transactional(readOnly = true)
    public UserResponse profile(UUID id) {
        return users.findById(id).map(UserResponse::from).orElseThrow(() -> ApiException.unauthorized("Authentication required"));
    }

    static void validatePassword(String password, String username) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) throw ApiException.badRequest("Password is too long (72 bytes maximum)");
        if (password.isBlank()) throw ApiException.badRequest("Password cannot be blank");
        String p = password.toLowerCase(Locale.ROOT);
        if (p.equals(username.toLowerCase(Locale.ROOT)) || p.contains(username.toLowerCase(Locale.ROOT)) && username.length() >= 5) {
            throw ApiException.badRequest("Password must not contain your username");
        }
        if (COMMON.contains(p)) throw ApiException.badRequest("That password is too common — choose another");
        if (p.chars().distinct().count() < 4) throw ApiException.badRequest("Password is too repetitive");
    }

    /** For tests: the roles list granted to every account. */
    public static List<String> roles() {
        return List.of("ROLE_USER");
    }
}
