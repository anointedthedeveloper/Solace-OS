package app.solace.preferences;

import app.solace.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stores the user's UI preferences as an opaque, size-limited JSON object. */
@Service
public class PreferencesService {
    static final int MAX_BYTES = 16 * 1024;
    private final PreferencesRepository repo;
    private final ObjectMapper mapper;
    private final Clock clock;

    public PreferencesService(PreferencesRepository repo, ObjectMapper mapper, Clock clock) {
        this.repo = repo;
        this.mapper = mapper;
        this.clock = clock;
    }

    public record Stored(JsonNode data, Instant updatedAt) {}

    @Transactional(readOnly = true)
    public Optional<Stored> get(UUID userId) {
        return repo.findById(userId).map(p -> new Stored(parse(p.getData()), p.getUpdatedAt()));
    }

    @Transactional
    public Stored put(UUID userId, JsonNode data) {
        if (data == null || !data.isObject()) throw ApiException.badRequest("Preferences must be a JSON object");
        String json = data.toString();
        if (json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_BYTES) throw ApiException.payloadTooLarge("Preferences are too large");
        Instant now = clock.instant();
        Preferences p = repo.findById(userId).orElse(null);
        if (p == null) repo.save(new Preferences(userId, json, now));
        else p.replace(json, now);
        return new Stored(data, now);
    }

    private JsonNode parse(String json) {
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException("Stored preferences are not valid JSON", e);
        }
    }
}
