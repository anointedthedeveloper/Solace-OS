package app.solace.files;

import java.util.Collection;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FileContentRepository extends JpaRepository<FileContent, UUID> {
    @Modifying
    @Query("delete from FileContent c where c.fileId in :ids")
    int deleteByFileIds(@Param("ids") Collection<UUID> ids);
}
