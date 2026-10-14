package app.solace.files;

import app.solace.common.ApiException;
import app.solace.common.PageResponse;
import app.solace.files.FileDtos.CreateFolderRequest;
import app.solace.files.FileDtos.FileResponse;
import app.solace.files.FileDtos.UpdateFileRequest;
import app.solace.files.FileDtos.UsageResponse;
import app.solace.security.AuthenticatedUser;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/files")
public class FileController {
    private final FileService files;

    public FileController(FileService files) {
        this.files = files;
    }

    @GetMapping
    public PageResponse<FileResponse> list(@AuthenticationPrincipal AuthenticatedUser me, @RequestParam(required = false) UUID parentId, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "200") int size) {
        return files.list(me.id(), parentId, page, size);
    }

    @GetMapping("/trash")
    public PageResponse<FileResponse> trash(@AuthenticationPrincipal AuthenticatedUser me, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "200") int size) {
        return files.listTrash(me.id(), page, size);
    }

    @DeleteMapping("/trash")
    public Map<String, Integer> emptyTrash(@AuthenticationPrincipal AuthenticatedUser me) {
        return Map.of("deleted", files.emptyTrash(me.id()));
    }

    @GetMapping("/usage")
    public UsageResponse usage(@AuthenticationPrincipal AuthenticatedUser me) {
        return files.usage(me.id());
    }

    @GetMapping("/{id}")
    public FileResponse get(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        return files.get(me.id(), id);
    }

    /** Always an attachment with a server-chosen type and nosniff, so stored content can never run in our origin. */
    @GetMapping("/{id}/content")
    public ResponseEntity<byte[]> content(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        FileService.Download d = files.download(me.id(), id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(d.mimeType()))
                .contentLength(d.bytes().length)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(d.name(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(d.bytes());
    }

    @PostMapping("/folders")
    public ResponseEntity<FileResponse> createFolder(@AuthenticationPrincipal AuthenticatedUser me, @Valid @RequestBody CreateFolderRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(files.createFolder(me.id(), req.parentId(), req.name()));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileResponse> upload(@AuthenticationPrincipal AuthenticatedUser me, @RequestPart("file") MultipartFile file, @RequestParam(required = false) UUID parentId) throws IOException {
        if (file.isEmpty() && file.getOriginalFilename() == null) throw ApiException.badRequest("No file was provided");
        String name = file.getOriginalFilename() == null ? "" : java.nio.file.Paths.get(file.getOriginalFilename().replace('\\', '/')).getFileName().toString();
        return ResponseEntity.status(HttpStatus.CREATED).body(files.upload(me.id(), parentId, name, file.getBytes()));
    }

    @PatchMapping("/{id}")
    public FileResponse update(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id, @Valid @RequestBody UpdateFileRequest req) {
        boolean move = Boolean.TRUE.equals(req.move());
        if (req.name() == null && !move) throw ApiException.badRequest("Provide a new name, or move=true with a parentId");
        FileResponse result = null;
        if (req.name() != null) result = files.rename(me.id(), id, req.name());
        if (move) result = files.move(me.id(), id, req.parentId());
        return result;
    }

    /** Moves to the trash (recoverable), or deletes for good with {@code ?permanent=true} (only from the trash). */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id, @RequestParam(defaultValue = "false") boolean permanent) {
        if (permanent) files.deletePermanently(me.id(), id);
        else files.trash(me.id(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/restore")
    public FileResponse restore(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        return files.restore(me.id(), id);
    }
}
