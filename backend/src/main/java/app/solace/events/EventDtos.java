package app.solace.events;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class EventDtos {
    private EventDtos() {}

    public record EventRequest(
            @NotBlank(message = "Title is required") @Size(max = 200, message = "Title must be at most 200 characters") String title,
            @Min(value = 0, message = "start must be a valid timestamp") long start,
            @Min(value = 0, message = "end must be a valid timestamp") long end,
            boolean allDay,
            @NotNull(message = "Location is required (may be empty)") @Size(max = 200, message = "Location must be at most 200 characters") String location,
            @NotNull(message = "Description is required (may be empty)") @Size(max = 2000, message = "Description must be at most 2000 characters") String description,
            @Min(value = 0, message = "updatedAt must be a valid timestamp") long updatedAt) {

        @AssertTrue(message = "The end must not be before the start")
        public boolean isEndAfterStart() {
            return end >= start;
        }
    }

    public record EventResponse(String id, String title, long start, long end, boolean allDay, String location, String description, long updatedAt) {
        static EventResponse from(CalendarEvent e) {
            return new EventResponse(e.getId().getId(), e.getTitle(), e.getStartAt(), e.getEndAt(), e.isAllDay(), e.getLocation(), e.getDescription(), e.getUpdatedAt());
        }
    }
}
