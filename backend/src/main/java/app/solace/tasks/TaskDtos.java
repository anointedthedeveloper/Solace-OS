package app.solace.tasks;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public final class TaskDtos {
    private TaskDtos() {}

    public record TaskRequest(
            @NotBlank(message = "Title is required") @Size(max = 200, message = "Title must be at most 200 characters") String title,
            @NotNull(message = "Details are required (may be empty)") @Size(max = 2000, message = "Details must be at most 2000 characters") String details,
            LocalDate due,
            @NotNull(message = "Priority is required") @Pattern(regexp = "^(low|medium|high)$", message = "Priority must be low, medium or high") String priority,
            boolean done,
            @Min(value = 0, message = "createdAt must be a valid timestamp") long createdAt,
            Long completedAt,
            @Min(value = 0, message = "updatedAt must be a valid timestamp") long updatedAt) {}

    public record TaskResponse(String id, String title, String details, LocalDate due, String priority, boolean done, long createdAt, Long completedAt, long updatedAt) {
        static TaskResponse from(Task t) {
            return new TaskResponse(t.getId().getId(), t.getTitle(), t.getDetails(), t.getDue(), t.getPriority(), t.isDone(), t.getCreatedAt(), t.getCompletedAt(), t.getUpdatedAt());
        }
    }
}
