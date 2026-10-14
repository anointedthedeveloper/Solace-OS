package app.solace.notes;

import app.solace.common.PageResponse;
import app.solace.notes.NoteDtos.NoteRequest;
import app.solace.notes.NoteDtos.NoteResponse;
import app.solace.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notes")
public class NoteController {
    private final NoteService service;

    public NoteController(NoteService service) {
        this.service = service;
    }

    @GetMapping
    public PageResponse<NoteResponse> list(@AuthenticationPrincipal AuthenticatedUser me, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "100") int size) {
        return service.list(me.id(), page, size);
    }

    @GetMapping("/{id}")
    public NoteResponse get(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id) {
        return service.get(me.id(), id);
    }

    @PutMapping("/{id}")
    public ResponseEntity<NoteResponse> put(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id, @Valid @RequestBody NoteRequest req) {
        var r = service.upsert(me.id(), id, req);
        return ResponseEntity.status(r.created() ? HttpStatus.CREATED : HttpStatus.OK).body(r.note());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id) {
        service.delete(me.id(), id);
        return ResponseEntity.noContent().build();
    }
}
