package app.solace.files;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Every query is scoped by owner id — there is deliberately no way to fetch a node by id alone. */
public interface FileNodeRepository extends JpaRepository<FileNode, UUID> {

    @Query("select n from FileNode n where n.id = :id and n.ownerId = :owner")
    Optional<FileNode> findOwned(@Param("owner") UUID owner, @Param("id") UUID id);

    @Query("""
            select n from FileNode n
            where n.ownerId = :owner and n.trashedAt is null and n.parentId is null
            order by case when n.kind = app.solace.files.FileNode$Kind.FOLDER then 0 else 1 end, lower(n.name)
            """)
    Page<FileNode> listActiveRoot(@Param("owner") UUID owner, Pageable pageable);

    @Query("""
            select n from FileNode n
            where n.ownerId = :owner and n.trashedAt is null and n.parentId = :parent
            order by case when n.kind = app.solace.files.FileNode$Kind.FOLDER then 0 else 1 end, lower(n.name)
            """)
    Page<FileNode> listActiveIn(@Param("owner") UUID owner, @Param("parent") UUID parent, Pageable pageable);

    /** Trash top level: trashed nodes whose parent is not trashed in the same operation. */
    @Query("""
            select n from FileNode n left join FileNode p on p.id = n.parentId
            where n.ownerId = :owner and n.trashedAt is not null
              and (p.id is null or p.trashedAt is null or p.trashedAt <> n.trashedAt)
            order by n.trashedAt desc, lower(n.name)
            """)
    Page<FileNode> listTrash(@Param("owner") UUID owner, Pageable pageable);

    @Query("select n from FileNode n where n.ownerId = :owner and n.parentId in :parents")
    List<FileNode> childrenOf(@Param("owner") UUID owner, @Param("parents") Collection<UUID> parents);

    @Query("""
            select count(n) > 0 from FileNode n
            where n.ownerId = :owner and n.trashedAt is null and n.parentId is null
              and lower(n.name) = lower(:name) and n.id <> :except
            """)
    boolean nameTakenInRoot(@Param("owner") UUID owner, @Param("name") String name, @Param("except") UUID except);

    @Query("""
            select count(n) > 0 from FileNode n
            where n.ownerId = :owner and n.trashedAt is null and n.parentId = :parent
              and lower(n.name) = lower(:name) and n.id <> :except
            """)
    boolean nameTakenIn(@Param("owner") UUID owner, @Param("parent") UUID parent, @Param("name") String name, @Param("except") UUID except);

    @Query("select coalesce(sum(n.sizeBytes), 0) from FileNode n where n.ownerId = :owner and n.kind = app.solace.files.FileNode$Kind.FILE")
    long totalBytes(@Param("owner") UUID owner);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update FileNode n set n.trashedAt = :at where n.ownerId = :owner and n.id in :ids and n.trashedAt is null")
    int markTrashed(@Param("owner") UUID owner, @Param("ids") Collection<UUID> ids, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update FileNode n set n.trashedAt = null where n.ownerId = :owner and n.id in :ids and n.trashedAt = :at")
    int unmarkTrashed(@Param("owner") UUID owner, @Param("ids") Collection<UUID> ids, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from FileNode n where n.ownerId = :owner and n.id in :ids")
    int deleteAllOwned(@Param("owner") UUID owner, @Param("ids") Collection<UUID> ids);

    @Query("select n.id from FileNode n where n.ownerId = :owner and n.trashedAt is not null")
    List<UUID> trashedIds(@Param("owner") UUID owner);
}
