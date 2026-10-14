package app.solace.files;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "file_contents")
public class FileContent {
    @Id
    @Column(name = "file_id")
    private UUID fileId;

    @Column(nullable = false)
    private byte[] content;

    protected FileContent() {}

    public FileContent(UUID fileId, byte[] content) {
        this.fileId = fileId;
        this.content = content;
    }

    public UUID getFileId() { return fileId; }
    public byte[] getContent() { return content; }
}
