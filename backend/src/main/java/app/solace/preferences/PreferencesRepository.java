package app.solace.preferences;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PreferencesRepository extends JpaRepository<Preferences, UUID> {}
