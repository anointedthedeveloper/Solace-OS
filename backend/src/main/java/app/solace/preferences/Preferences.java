package app.solace.preferences;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "preferences")
public class Preferences {
    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false, columnDefinition = "text")
    private String data;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Preferences() {}

    public Preferences(UUID userId, String data, Instant updatedAt) {
        this.userId = userId;
        this.data = data;
        this.updatedAt = updatedAt;
    }

    public UUID getUserId() { return userId; }
    public String getData() { return data; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void replace(String data, Instant now) {
        this.data = data;
        this.updatedAt = now;
    }
}
