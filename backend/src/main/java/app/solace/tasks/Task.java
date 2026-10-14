package app.solace.tasks;

import app.solace.common.OwnedId;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;

@Entity
@Table(name = "tasks")
public class Task {
    @EmbeddedId
    private OwnedId id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 2000)
    private String details;

    private LocalDate due;

    @Column(nullable = false, length = 8)
    private String priority;

    @Column(nullable = false)
    private boolean done;

    @Column(name = "created_at", nullable = false)
    private long createdAt;

    @Column(name = "completed_at")
    private Long completedAt;

    @Column(name = "updated_at", nullable = false)
    private long updatedAt;

    protected Task() {}

    public Task(OwnedId id, String title, String details, LocalDate due, String priority, boolean done, long createdAt, Long completedAt, long updatedAt) {
        this.id = id;
        apply(title, details, due, priority, done, completedAt, updatedAt);
        this.createdAt = createdAt;
    }

    public void apply(String title, String details, LocalDate due, String priority, boolean done, Long completedAt, long updatedAt) {
        this.title = title;
        this.details = details;
        this.due = due;
        this.priority = priority;
        this.done = done;
        this.completedAt = completedAt;
        this.updatedAt = updatedAt;
    }

    public OwnedId getId() { return id; }
    public String getTitle() { return title; }
    public String getDetails() { return details; }
    public LocalDate getDue() { return due; }
    public String getPriority() { return priority; }
    public boolean isDone() { return done; }
    public long getCreatedAt() { return createdAt; }
    public Long getCompletedAt() { return completedAt; }
    public long getUpdatedAt() { return updatedAt; }
}
