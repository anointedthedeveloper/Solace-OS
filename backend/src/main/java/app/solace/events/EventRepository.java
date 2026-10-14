package app.solace.events;

import app.solace.common.OwnedId;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventRepository extends JpaRepository<CalendarEvent, OwnedId> {
    @Query("select e from CalendarEvent e where e.id.userId = :userId")
    Page<CalendarEvent> findAllOwnedBy(@Param("userId") UUID userId, Pageable pageable);

    @Modifying
    @Query("delete from CalendarEvent e where e.id.userId = :userId and e.id.id = :id")
    int deleteOwned(@Param("userId") UUID userId, @Param("id") String id);
}
