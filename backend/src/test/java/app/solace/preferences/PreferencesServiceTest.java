package app.solace.preferences;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import app.solace.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PreferencesServiceTest {
    private final PreferencesRepository repo = mock(PreferencesRepository.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final PreferencesService service = new PreferencesService(repo, mapper, Clock.systemUTC());
    private final UUID user = UUID.randomUUID();

    @Test
    void createsPreferencesOnFirstWrite() throws Exception {
        when(repo.findById(user)).thenReturn(Optional.empty());
        service.put(user, mapper.readTree("{\"theme\":\"dark\"}"));
        verify(repo).save(any(Preferences.class));
    }

    @Test
    void updatesInPlaceAfterwards() throws Exception {
        Preferences existing = new Preferences(user, "{\"a\":1}", java.time.Instant.EPOCH);
        when(repo.findById(user)).thenReturn(Optional.of(existing));
        service.put(user, mapper.readTree("{\"b\":2}"));
        assertThat(existing.getData()).isEqualTo("{\"b\":2}");
        verify(repo, never()).save(any());
    }

    @Test
    void rejectsNonObjectsAndOversizedPayloads() throws Exception {
        assertThatThrownBy(() -> service.put(user, mapper.readTree("[1]"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.put(user, null)).isInstanceOf(ApiException.class);
        String big = "{\"x\":\"" + "a".repeat(PreferencesService.MAX_BYTES) + "\"}";
        assertThatThrownBy(() -> service.put(user, mapper.readTree(big))).isInstanceOf(ApiException.class).hasMessageContaining("too large");
        verify(repo, never()).save(any());
    }
}
