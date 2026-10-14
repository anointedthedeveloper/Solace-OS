package app.solace.events;

import app.solace.common.OwnedId;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "events")
public class CalendarEvent {
    @EmbeddedId
    private OwnedId id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "start_at", nullable = false)
    private long startAt;

    @Column(name = "end_at", nullable = false)
    private long endAt;

    @Column(name = "all_day", nullable = false)
    private boolean allDay;

    @Column(nullable = false, length = 200)
    private String location;

    @Column(nullable = false, length = 2000)
    private String description;

    @Column(name = "updated_at", nullable = false)
    private long updatedAt;

    protected CalendarEvent() {}

    public CalendarEvent(OwnedId id, String title, long startAt, long endAt, boolean allDay, String location, String description, long updatedAt) {
        this.id = id;
        apply(title, startAt, endAt, allDay, location, description, updatedAt);
    }

    public void apply(String title, long startAt, long endAt, boolean allDay, String location, String description, long updatedAt) {
        this.title = title;
        this.startAt = startAt;
        this.endAt = endAt;
        this.allDay = allDay;
        this.location = location;
        this.description = description;
        this.updatedAt = updatedAt;
    }

    public OwnedId getId() { return id; }
    public String getTitle() { return title; }
    public long getStartAt() { return startAt; }
    public long getEndAt() { return endAt; }
    public boolean isAllDay() { return allDay; }
    public String getLocation() { return location; }
    public String getDescription() { return description; }
    public long getUpdatedAt() { return updatedAt; }
}
