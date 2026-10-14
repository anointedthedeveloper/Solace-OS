package app.solace.files;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A folder or file in a user's server-managed storage. Content bytes live in {@link FileContent}. */
@Entity
@Table(name = "file_nodes")
public class FileNode {
    public enum Kind { FILE, FOLDER }

    @Id
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(nullable = false, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private Kind kind;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "trashed_at")
    private Instant trashedAt;

    protected FileNode() {}

    public FileNode(UUID id, UUID ownerId, UUID parentId, String name, Kind kind, String mimeType, long sizeBytes, Instant now) {
        this.id = id;
        this.ownerId = ownerId;
        this.parentId = parentId;
        this.name = name;
        this.kind = kind;
        this.mimeType = mimeType;
        this.sizeBytes = sizeBytes;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() { return id; }
    public UUID getOwnerId() { return ownerId; }
    public UUID getParentId() { return parentId; }
    public String getName() { return name; }
    public Kind getKind() { return kind; }
    public String getMimeType() { return mimeType; }
    public long getSizeBytes() { return sizeBytes; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getTrashedAt() { return trashedAt; }
    public boolean isTrashed() { return trashedAt != null; }
    public boolean isFolder() { return kind == Kind.FOLDER; }

    public void rename(String newName, Instant now) {
        this.name = newName;
        this.updatedAt = now;
    }

    public void moveTo(UUID newParent, Instant now) {
        this.parentId = newParent;
        this.updatedAt = now;
    }

    public void setTrashedAt(Instant t) { this.trashedAt = t; }
}
