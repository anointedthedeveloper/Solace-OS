package app.solace.tasks;

import app.solace.common.OwnedId;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<Task, OwnedId> {
    @Query("select t from Task t where t.id.userId = :userId")
    Page<Task> findAllOwnedBy(@Param("userId") UUID userId, Pageable pageable);

    @Modifying
    @Query("delete from Task t where t.id.userId = :userId and t.id.id = :id")
    int deleteOwned(@Param("userId") UUID userId, @Param("id") String id);
}
