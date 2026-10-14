package app.solace.events;

import app.solace.common.ApiException;
import app.solace.common.Ids;
import app.solace.common.OwnedId;
import app.solace.common.PageResponse;
import app.solace.common.Paging;
import app.solace.events.EventDtos.EventRequest;
import app.solace.events.EventDtos.EventResponse;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EventService {
    private final EventRepository repo;

    public EventService(EventRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public PageResponse<EventResponse> list(UUID userId, int page, int size) {
        return PageResponse.of(repo.findAllOwnedBy(userId, Paging.of(page, size, Sort.by("startAt").and(Sort.by("id.id")))), EventResponse::from);
    }

    @Transactional(readOnly = true)
    public EventResponse get(UUID userId, String id) {
        return repo.findById(new OwnedId(userId, Ids.require(id))).map(EventResponse::from).orElseThrow(() -> ApiException.notFound("Event"));
    }

    @Transactional
    public Result upsert(UUID userId, String id, EventRequest r) {
        OwnedId key = new OwnedId(userId, Ids.require(id));
        String title = r.title().trim();
        CalendarEvent existing = repo.findById(key).orElse(null);
        if (existing == null) {
            return new Result(EventResponse.from(repo.save(new CalendarEvent(key, title, r.start(), r.end(), r.allDay(), r.location(), r.description(), r.updatedAt()))), true);
        }
        if (r.updatedAt() < existing.getUpdatedAt()) throw ApiException.conflict("A newer version of this event exists");
        existing.apply(title, r.start(), r.end(), r.allDay(), r.location(), r.description(), r.updatedAt());
        return new Result(EventResponse.from(existing), false);
    }

    @Transactional
    public void delete(UUID userId, String id) {
        if (repo.deleteOwned(userId, Ids.require(id)) == 0) throw ApiException.notFound("Event");
    }

    public record Result(EventResponse event, boolean created) {}
}
