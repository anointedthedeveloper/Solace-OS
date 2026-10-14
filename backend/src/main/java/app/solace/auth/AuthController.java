package app.solace.auth;

import app.solace.auth.AuthDtos.LoginRequest;
import app.solace.auth.AuthDtos.RegisterRequest;
import app.solace.common.ApiException;
import app.solace.security.AuthenticatedUser;
import app.solace.user.UserDtos.UserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    private final SecurityContextRepository contextRepository;

    public AuthController(AuthService auth, SecurityContextRepository contextRepository) {
        this.auth = auth;
        this.contextRepository = contextRepository;
    }

    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest req, HttpServletRequest http, HttpServletResponse res) {
        AuthenticatedUser user = auth.register(req, clientIp(http));
        startSession(user, http, res);
        return ResponseEntity.status(HttpStatus.CREATED).body(auth.profile(user.id()));
    }

    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest req, HttpServletRequest http, HttpServletResponse res) {
        AuthenticatedUser user = auth.login(req, clientIp(http));
        startSession(user, http, res);
        return auth.profile(user.id());
    }

    /** Ends the session on the server (and so invalidates the cookie everywhere it is replayed). */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest http, HttpServletResponse res) {
        HttpSession session = http.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    /** 200 with the signed-in user, or 401. Also primes the XSRF-TOKEN cookie for the single-page app. */
    @GetMapping("/me")
    public UserResponse me(org.springframework.security.core.Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser u)) throw ApiException.unauthorized("Not signed in");
        return auth.profile(u.id());
    }

    private void startSession(AuthenticatedUser user, HttpServletRequest http, HttpServletResponse res) {
        // New session id on every login defeats session fixation.
        if (http.getSession(false) != null) http.changeSessionId();
        Authentication token = UsernamePasswordAuthenticationToken.authenticated(user, null, AuthService.roles().stream().map(SimpleGrantedAuthority::new).toList());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(token);
        SecurityContextHolder.setContext(context);
        http.getSession(true);
        contextRepository.saveContext(context, http, res);
    }

    private static String clientIp(HttpServletRequest http) {
        return http.getRemoteAddr();
    }
}
