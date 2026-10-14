package app.solace.events;

import app.solace.common.PageResponse;
import app.solace.events.EventDtos.EventRequest;
import app.solace.events.EventDtos.EventResponse;
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
@RequestMapping("/api/events")
public class EventController {
    private final EventService service;

    public EventController(EventService service) {
        this.service = service;
    }

    @GetMapping
    public PageResponse<EventResponse> list(@AuthenticationPrincipal AuthenticatedUser me, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "100") int size) {
        return service.list(me.id(), page, size);
    }

    @GetMapping("/{id}")
    public EventResponse get(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id) {
        return service.get(me.id(), id);
    }

    @PutMapping("/{id}")
    public ResponseEntity<EventResponse> put(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id, @Valid @RequestBody EventRequest req) {
        var r = service.upsert(me.id(), id, req);
        return ResponseEntity.status(r.created() ? HttpStatus.CREATED : HttpStatus.OK).body(r.event());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id) {
        service.delete(me.id(), id);
        return ResponseEntity.noContent().build();
    }
}
