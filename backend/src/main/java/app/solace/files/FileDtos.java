package app.solace.files;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class FileDtos {
    private FileDtos() {}

    public record FileResponse(UUID id, UUID parentId, String name, String kind, String mimeType, long size, Instant createdAt, Instant updatedAt, Instant trashedAt) {
        static FileResponse from(FileNode n) {
            return new FileResponse(n.getId(), n.getParentId(), n.getName(), n.getKind().name().toLowerCase(), n.getMimeType(), n.getSizeBytes(), n.getCreatedAt(), n.getUpdatedAt(), n.getTrashedAt());
        }
    }

    public record CreateFolderRequest(UUID parentId, @NotNull(message = "Name is required") @Size(max = 120, message = "Name must be at most 120 characters") String name) {}

    /** Rename with {@code name}; move with {@code move=true} (and {@code parentId}, null = root). */
    public record UpdateFileRequest(@Size(max = 120, message = "Name must be at most 120 characters") String name, Boolean move, UUID parentId) {}

    public record UsageResponse(long usedBytes, long quotaBytes, long maxFileBytes) {}
}
