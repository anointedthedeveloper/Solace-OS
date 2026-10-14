package app.solace.notes;

import app.solace.common.ApiException;
import app.solace.common.Ids;
import app.solace.common.OwnedId;
import app.solace.common.PageResponse;
import app.solace.common.Paging;
import app.solace.notes.NoteDtos.NoteRequest;
import app.solace.notes.NoteDtos.NoteResponse;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NoteService {
    private final NoteRepository repo;

    public NoteService(NoteRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public PageResponse<NoteResponse> list(UUID userId, int page, int size) {
        return PageResponse.of(repo.findAllOwnedBy(userId, Paging.of(page, size, Sort.by("id.id"))), NoteResponse::from);
    }

    @Transactional(readOnly = true)
    public NoteResponse get(UUID userId, String id) {
        return repo.findById(new OwnedId(userId, Ids.require(id))).map(NoteResponse::from).orElseThrow(() -> ApiException.notFound("Note"));
    }

    /** Create-or-update by client id. A stale write (older updatedAt than stored) is rejected with 409. */
    @Transactional
    public Result upsert(UUID userId, String id, NoteRequest req) {
        OwnedId key = new OwnedId(userId, Ids.require(id));
        Note existing = repo.findById(key).orElse(null);
        if (existing == null) {
            return new Result(NoteResponse.from(repo.save(new Note(key, req.title(), req.content(), req.pinned(), req.archived(), req.createdAt(), req.updatedAt()))), true);
        }
        if (req.updatedAt() < existing.getUpdatedAt()) throw ApiException.conflict("A newer version of this note exists");
        existing.apply(req.title(), req.content(), req.pinned(), req.archived(), req.updatedAt());
        return new Result(NoteResponse.from(existing), false);
    }

    @Transactional
    public void delete(UUID userId, String id) {
        if (repo.deleteOwned(userId, Ids.require(id)) == 0) throw ApiException.notFound("Note");
    }

    public record Result(NoteResponse note, boolean created) {}
}
