package app.solace.config;

import app.solace.security.ActiveUserFilter;
import app.solace.security.ApiSecurityHeadersFilter;
import app.solace.security.CsrfCookieFilter;
import app.solace.security.JsonSecurityHandlers;
import app.solace.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder(AppProperties props) {
        return new BCryptPasswordEncoder(props.getBcryptStrength());
    }

    /**
     * Authentication is done explicitly by AuthService. Declaring an empty UserDetailsService stops
     * Spring Boot from auto-creating a default in-memory user with a generated password.
     */
    @Bean
    UserDetailsService noInMemoryUsers() {
        return username -> {
            throw new UsernameNotFoundException("Users are authenticated by AuthService");
        };
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    JsonSecurityHandlers jsonSecurityHandlers(ObjectMapper mapper) {
        return new JsonSecurityHandlers(mapper);
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, AppProperties props, SecurityContextRepository contextRepo, JsonSecurityHandlers handlers, UserRepository users) throws Exception {
        CookieCsrfTokenRepository csrfRepo = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfRepo.setCookieCustomizer(c -> c.secure(props.isCookieSecure()).sameSite("Lax").path("/"));

        http
            .cors(props.corsOrigins().isEmpty() ? c -> c.disable() : Customizer.withDefaults())
            // CSRF protection for the cookie session: the SPA echoes the XSRF-TOKEN cookie in X-XSRF-TOKEN.
            .csrf(csrf -> csrf.csrfTokenRepository(csrfRepo).csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .securityContext(sc -> sc.securityContextRepository(contextRepo).requireExplicitSave(true))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED).sessionFixation(f -> f.changeSessionId()))
            .formLogin(f -> f.disable())
            .httpBasic(b -> b.disable())
            .logout(l -> l.disable()) // logout is an explicit endpoint (POST /api/auth/logout)
            .exceptionHandling(e -> e.authenticationEntryPoint(handlers).accessDeniedHandler(handlers))
            .headers(h -> h
                .contentTypeOptions(Customizer.withDefaults())
                .frameOptions(f -> f.deny())
                .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000)))
            .authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/auth/me").permitAll() // answers 401 itself when signed out
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll() // only exposed when springdoc is enabled
                .requestMatchers("/api/**").authenticated()
                .anyRequest().denyAll())
            .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
            .addFilterAfter(new ApiSecurityHeadersFilter(), CsrfCookieFilter.class)
            .addFilterAfter(new ActiveUserFilter(users, handlers), ApiSecurityHeadersFilter.class);
        return http.build();
    }

    /** Narrow CORS: only the configured origins, only the methods/headers the SPA uses. Disabled when empty. */
    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProperties props) {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(props.corsOrigins());
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
        cfg.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cfg);
        return source;
    }
}
