package app.solace.common;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** Primary key of user-owned rows: the owner is part of the key, so rows can never cross accounts. */
@Embeddable
public class OwnedId implements Serializable {
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "id", nullable = false, length = 64)
    private String id;

    protected OwnedId() {}

    public OwnedId(UUID userId, String id) {
        this.userId = userId;
        this.id = id;
    }

    public UUID getUserId() { return userId; }
    public String getId() { return id; }

    @Override
    public boolean equals(Object o) {
        return o instanceof OwnedId other && Objects.equals(userId, other.userId) && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, id);
    }
}
