package app.solace.notes;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class NoteDtos {
    private NoteDtos() {}

    public record NoteRequest(
            @NotNull(message = "Title is required") @Size(max = 500, message = "Title must be at most 500 characters") String title,
            @NotNull(message = "Content is required") @Size(max = 200_000, message = "Content must be at most 200,000 characters") String content,
            boolean pinned,
            boolean archived,
            @Min(value = 0, message = "createdAt must be a valid timestamp") long createdAt,
            @Min(value = 0, message = "updatedAt must be a valid timestamp") long updatedAt) {}

    public record NoteResponse(String id, String title, String content, boolean pinned, boolean archived, long createdAt, long updatedAt) {
        static NoteResponse from(Note n) {
            return new NoteResponse(n.getId().getId(), n.getTitle(), n.getContent(), n.isPinned(), n.isArchived(), n.getCreatedAt(), n.getUpdatedAt());
        }
    }
}
