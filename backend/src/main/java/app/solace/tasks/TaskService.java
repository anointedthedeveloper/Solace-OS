package app.solace.tasks;

import app.solace.common.ApiException;
import app.solace.common.Ids;
import app.solace.common.OwnedId;
import app.solace.common.PageResponse;
import app.solace.common.Paging;
import app.solace.tasks.TaskDtos.TaskRequest;
import app.solace.tasks.TaskDtos.TaskResponse;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskService {
    private final TaskRepository repo;

    public TaskService(TaskRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public PageResponse<TaskResponse> list(UUID userId, int page, int size) {
        return PageResponse.of(repo.findAllOwnedBy(userId, Paging.of(page, size, Sort.by("id.id"))), TaskResponse::from);
    }

    @Transactional(readOnly = true)
    public TaskResponse get(UUID userId, String id) {
        return repo.findById(new OwnedId(userId, Ids.require(id))).map(TaskResponse::from).orElseThrow(() -> ApiException.notFound("Task"));
    }

    @Transactional
    public Result upsert(UUID userId, String id, TaskRequest r) {
        OwnedId key = new OwnedId(userId, Ids.require(id));
        String title = r.title().trim();
        Task existing = repo.findById(key).orElse(null);
        if (existing == null) {
            return new Result(TaskResponse.from(repo.save(new Task(key, title, r.details(), r.due(), r.priority(), r.done(), r.createdAt(), r.completedAt(), r.updatedAt()))), true);
        }
        if (r.updatedAt() < existing.getUpdatedAt()) throw ApiException.conflict("A newer version of this task exists");
        existing.apply(title, r.details(), r.due(), r.priority(), r.done(), r.completedAt(), r.updatedAt());
        return new Result(TaskResponse.from(existing), false);
    }

    @Transactional
    public void delete(UUID userId, String id) {
        if (repo.deleteOwned(userId, Ids.require(id)) == 0) throw ApiException.notFound("Task");
    }

    public record Result(TaskResponse task, boolean created) {}
}
