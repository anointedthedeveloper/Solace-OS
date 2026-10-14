package app.solace.security;

import app.solace.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.util.Set;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * A session can outlive its account (deleted from another device). For state-changing requests make
 * sure the account still exists; otherwise drop the session so the caller gets a clean 401.
 */
public class ActiveUserFilter extends OncePerRequestFilter {
    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");
    private final UserRepository users;
    private final JsonSecurityHandlers handlers;

    public ActiveUserFilter(UserRepository users, JsonSecurityHandlers handlers) {
        this.users = users;
        this.handlers = handlers;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!SAFE.contains(req.getMethod()) && auth != null && auth.getPrincipal() instanceof AuthenticatedUser u && !users.existsById(u.id())) {
            HttpSession session = req.getSession(false);
            if (session != null) session.invalidate();
            SecurityContextHolder.clearContext();
            handlers.commence(req, res, null);
            return;
        }
        chain.doFilter(req, res);
    }
}
