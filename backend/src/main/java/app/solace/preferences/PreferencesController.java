package app.solace.preferences;

import app.solace.preferences.PreferencesService.Stored;
import app.solace.security.AuthenticatedUser;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/preferences")
public class PreferencesController {
    private final PreferencesService service;

    public PreferencesController(PreferencesService service) {
        this.service = service;
    }

    public record PreferencesResponse(JsonNode data, Instant updatedAt) {
        static PreferencesResponse from(Stored s) {
            return new PreferencesResponse(s.data(), s.updatedAt());
        }
    }

    /** 204 when the account has no stored preferences yet. */
    @GetMapping
    public ResponseEntity<PreferencesResponse> get(@AuthenticationPrincipal AuthenticatedUser me) {
        return service.get(me.id()).map(s -> ResponseEntity.ok(PreferencesResponse.from(s))).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping
    public PreferencesResponse put(@AuthenticationPrincipal AuthenticatedUser me, @RequestBody JsonNode body) {
        return PreferencesResponse.from(service.put(me.id(), body));
    }
}
