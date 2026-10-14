package app.solace.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import app.solace.auth.AuthDtos.LoginRequest;
import app.solace.auth.AuthDtos.RegisterRequest;
import app.solace.common.ApiException;
import app.solace.common.TooManyRequestsException;
import app.solace.config.AppProperties;
import app.solace.security.AuthenticatedUser;
import app.solace.user.User;
import app.solace.user.UserRepository;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {
    @Mock UserRepository users;
    PasswordEncoder encoder = new BCryptPasswordEncoder(4);
    AppProperties props = new AppProperties();
    AuthService service;

    @BeforeEach
    void setUp() {
        props.getRateLimit().setLoginFailuresPerUser(3);
        props.getRateLimit().setLoginPerIp(6);
        props.getRateLimit().setRegisterPerIp(2);
        service = new AuthService(users, encoder, Clock.systemUTC(), props);
    }

    private static RegisterRequest reg(String user, String pass) { return new RegisterRequest(user, pass, "  Ada  "); }

    private User existingUser(String name, String password) {
        return new User(UUID.randomUUID(), name, name, encoder.encode(password), java.time.Instant.now());
    }

    @Test
    void registerStoresOnlyABcryptHash() {
        AuthenticatedUser u = service.register(reg("ada", "correct horse battery"), "1.1.1.1");
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getPasswordHash()).startsWith("$2").doesNotContain("correct horse battery");
        assertThat(encoder.matches("correct horse battery", saved.getValue().getPasswordHash())).isTrue();
        assertThat(saved.getValue().getDisplayName()).isEqualTo("Ada");
        assertThat(u.username()).isEqualTo("ada");
    }

    @Test
    void registerDefaultsDisplayNameToUsername() {
        service.register(new RegisterRequest("grace", "another long passphrase", null), "1.1.1.1");
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getDisplayName()).isEqualTo("grace");
    }

    @Test
    void registerRejectsDuplicateUsernamesCaseInsensitively() {
        when(users.existsByUsernameLower("ada")).thenReturn(true);
        assertThatThrownBy(() -> service.register(reg("ADA", "correct horse battery"), "1.1.1.1")).isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void registerHandlesALostRaceOnTheUniqueIndex() {
        when(users.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("dup"));
        assertThatThrownBy(() -> service.register(reg("racer", "correct horse battery"), "1.1.1.1")).isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void passwordPolicy() {
        assertThatThrownBy(() -> AuthService.validatePassword("password123", "someone")).hasMessageContaining("too common");
        assertThatThrownBy(() -> AuthService.validatePassword("aaaaaaaaaaaa", "someone")).hasMessageContaining("repetitive");
        assertThatThrownBy(() -> AuthService.validatePassword("myusername-is-here", "myusername")).hasMessageContaining("username");
        assertThatThrownBy(() -> AuthService.validatePassword("é".repeat(40), "u")).hasMessageContaining("too long"); // 80 bytes
        assertThatThrownBy(() -> AuthService.validatePassword("          ", "u")).isInstanceOf(ApiException.class);
        AuthService.validatePassword("a perfectly fine passphrase", "ada");
    }

    @Test
    void registrationIsRateLimitedPerAddress() {
        service.register(reg("one", "a long enough passphrase"), "9.9.9.9");
        service.register(reg("two", "a long enough passphrase"), "9.9.9.9");
        assertThatThrownBy(() -> service.register(reg("three", "a long enough passphrase"), "9.9.9.9")).isInstanceOf(TooManyRequestsException.class);
        service.register(reg("four", "a long enough passphrase"), "8.8.8.8"); // other address unaffected
    }

    @Test
    void loginSucceedsWithTheRightPassword() {
        User u = existingUser("ada", "correct horse battery");
        when(users.findByUsernameLower("ada")).thenReturn(Optional.of(u));
        assertThat(service.login(new LoginRequest(" Ada ", "correct horse battery"), "1.1.1.1").id()).isEqualTo(u.getId());
    }

    @Test
    void wrongPasswordAndUnknownUserGiveTheSameAnswer() {
        when(users.findByUsernameLower("ada")).thenReturn(Optional.of(existingUser("ada", "correct horse battery")));
        when(users.findByUsernameLower("ghost")).thenReturn(Optional.empty());
        ApiException wrong = catchApi(() -> service.login(new LoginRequest("ada", "nope nope nope"), "1.1.1.1"));
        ApiException unknown = catchApi(() -> service.login(new LoginRequest("ghost", "nope nope nope"), "1.1.1.1"));
        assertThat(wrong.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(unknown.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(wrong.getMessage()).isEqualTo(unknown.getMessage()); // no username enumeration
    }

    @Test
    void repeatedFailuresLockTheUsernameEvenForTheCorrectPassword() {
        when(users.findByUsernameLower("ada")).thenReturn(Optional.of(existingUser("ada", "correct horse battery")));
        for (int i = 0; i < 3; i++) catchApi(() -> service.login(new LoginRequest("ada", "bad bad bad bad"), "1.1.1.1"));
        assertThatThrownBy(() -> service.login(new LoginRequest("ada", "correct horse battery"), "2.2.2.2")).isInstanceOfSatisfying(TooManyRequestsException.class, e -> assertThat(e.retryAfterSeconds()).isPositive());
    }

    @Test
    void aSuccessfulLoginClearsTheFailureCounter() {
        when(users.findByUsernameLower("ada")).thenReturn(Optional.of(existingUser("ada", "correct horse battery")));
        catchApi(() -> service.login(new LoginRequest("ada", "bad bad bad bad"), "1.1.1.1"));
        catchApi(() -> service.login(new LoginRequest("ada", "bad bad bad bad"), "1.1.1.1"));
        service.login(new LoginRequest("ada", "correct horse battery"), "1.1.1.1");
        catchApi(() -> service.login(new LoginRequest("ada", "bad bad bad bad"), "1.1.1.1"));
        catchApi(() -> service.login(new LoginRequest("ada", "bad bad bad bad"), "1.1.1.1")); // still below the limit of 3
    }

    @Test
    void loginAttemptsAreLimitedPerAddress() {
        when(users.findByUsernameLower(anyString())).thenReturn(Optional.empty());
        for (int i = 0; i < 6; i++) {
            String name = "user" + i; // different names so only the per-address limit can trigger
            catchApi(() -> service.login(new LoginRequest(name, "whatever whatever"), "7.7.7.7"));
        }
        assertThatThrownBy(() -> service.login(new LoginRequest("another", "whatever whatever"), "7.7.7.7")).isInstanceOf(TooManyRequestsException.class);
        verify(users, never()).findByUsernameLower(eq("another"));
    }

    private static ApiException catchApi(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            return e;
        }
        throw new AssertionError("expected ApiException");
    }
}
