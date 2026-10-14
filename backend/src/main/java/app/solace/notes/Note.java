package app.solace.notes;

import app.solace.common.OwnedId;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "notes")
public class Note {
    @EmbeddedId
    private OwnedId id;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(nullable = false)
    private boolean pinned;

    @Column(nullable = false)
    private boolean archived;

    @Column(name = "created_at", nullable = false)
    private long createdAt;

    @Column(name = "updated_at", nullable = false)
    private long updatedAt;

    protected Note() {}

    public Note(OwnedId id, String title, String content, boolean pinned, boolean archived, long createdAt, long updatedAt) {
        this.id = id;
        this.title = title;
        this.content = content;
        this.pinned = pinned;
        this.archived = archived;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public OwnedId getId() { return id; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public boolean isPinned() { return pinned; }
    public boolean isArchived() { return archived; }
    public long getCreatedAt() { return createdAt; }
    public long getUpdatedAt() { return updatedAt; }

    public void apply(String title, String content, boolean pinned, boolean archived, long updatedAt) {
        this.title = title;
        this.content = content;
        this.pinned = pinned;
        this.archived = archived;
        this.updatedAt = updatedAt;
    }
}
