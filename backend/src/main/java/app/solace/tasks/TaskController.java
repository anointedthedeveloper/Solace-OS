package app.solace.tasks;

import app.solace.common.PageResponse;
import app.solace.security.AuthenticatedUser;
import app.solace.tasks.TaskDtos.TaskRequest;
import app.solace.tasks.TaskDtos.TaskResponse;
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
@RequestMapping("/api/tasks")
public class TaskController {
    private final TaskService service;

    public TaskController(TaskService service) {
        this.service = service;
    }

    @GetMapping
    public PageResponse<TaskResponse> list(@AuthenticationPrincipal AuthenticatedUser me, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "100") int size) {
        return service.list(me.id(), page, size);
    }

    @GetMapping("/{id}")
    public TaskResponse get(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id) {
        return service.get(me.id(), id);
    }

    @PutMapping("/{id}")
    public ResponseEntity<TaskResponse> put(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id, @Valid @RequestBody TaskRequest req) {
        var r = service.upsert(me.id(), id, req);
        return ResponseEntity.status(r.created() ? HttpStatus.CREATED : HttpStatus.OK).body(r.task());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable String id) {
        service.delete(me.id(), id);
        return ResponseEntity.noContent().build();
    }
}
