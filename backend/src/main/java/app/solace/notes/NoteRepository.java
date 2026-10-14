package app.solace.notes;

import app.solace.common.OwnedId;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NoteRepository extends JpaRepository<Note, OwnedId> {
    @Query("select n from Note n where n.id.userId = :userId")
    Page<Note> findAllOwnedBy(@Param("userId") UUID userId, Pageable pageable);

    @Modifying
    @Query("delete from Note n where n.id.userId = :userId and n.id.id = :id")
    int deleteOwned(@Param("userId") UUID userId, @Param("id") String id);
}
