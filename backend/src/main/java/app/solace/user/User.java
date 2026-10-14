package app.solace.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {
    @Id
    private UUID id;

    @Column(nullable = false, length = 32)
    private String username;

    @Column(name = "username_lower", nullable = false, length = 32, unique = true)
    private String usernameLower;

    @Column(name = "display_name", nullable = false, length = 40)
    private String displayName;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected User() {}

    public User(UUID id, String username, String displayName, String passwordHash, Instant now) {
        this.id = id;
        this.username = username;
        this.usernameLower = username.toLowerCase(java.util.Locale.ROOT);
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() { return id; }
    public String getUsername() { return username; }
    public String getDisplayName() { return displayName; }
    public String getPasswordHash() { return passwordHash; }
    public Instant getCreatedAt() { return createdAt; }

    public void setDisplayName(String displayName, Instant now) {
        this.displayName = displayName;
        this.updatedAt = now;
    }
}
