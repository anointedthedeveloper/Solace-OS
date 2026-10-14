package app.solace.files;

import app.solace.common.ApiException;
import app.solace.common.PageResponse;
import app.solace.common.Paging;
import app.solace.config.AppProperties;
import app.solace.files.FileDtos.FileResponse;
import app.solace.files.FileDtos.UsageResponse;
import app.solace.files.FileNode.Kind;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FileService {
    private static final Logger log = LoggerFactory.getLogger(FileService.class);
    private static final int MAX_DEPTH = 64;
    private static final UUID NIL = new UUID(0L, 0L);

    private final FileNodeRepository nodes;
    private final FileContentRepository contents;
    private final AppProperties props;
    private final Clock clock;

    public FileService(FileNodeRepository nodes, FileContentRepository contents, AppProperties props, Clock clock) {
        this.nodes = nodes;
        this.contents = contents;
        this.props = props;
        this.clock = clock;
    }

    public record Download(String name, String mimeType, byte[] bytes) {}

    /* ── reads ─────────────────────────────────────────────────────── */

    @Transactional(readOnly = true)
    public PageResponse<FileResponse> list(UUID owner, UUID parentId, int page, int size) {
        if (parentId != null) requireActiveFolder(owner, parentId);
        var pageable = Paging.of(page, size, Sort.unsorted());
        return PageResponse.of(parentId == null ? nodes.listActiveRoot(owner, pageable) : nodes.listActiveIn(owner, parentId, pageable), FileResponse::from);
    }

    @Transactional(readOnly = true)
    public PageResponse<FileResponse> listTrash(UUID owner, int page, int size) {
        return PageResponse.of(nodes.listTrash(owner, Paging.of(page, size, Sort.unsorted())), FileResponse::from);
    }

    @Transactional(readOnly = true)
    public FileResponse get(UUID owner, UUID id) {
        return FileResponse.from(requireOwned(owner, id));
    }

    @Transactional(readOnly = true)
    public Download download(UUID owner, UUID id) {
        FileNode n = requireOwned(owner, id);
        if (n.isFolder()) throw ApiException.badRequest("Folders cannot be downloaded");
        if (n.isTrashed()) throw ApiException.notFound("File");
        byte[] bytes = contents.findById(n.getId()).orElseThrow(() -> ApiException.notFound("File")).getContent();
        return new Download(n.getName(), n.getMimeType(), bytes);
    }

    @Transactional(readOnly = true)
    public UsageResponse usage(UUID owner) {
        return new UsageResponse(nodes.totalBytes(owner), props.getFiles().getQuotaBytes(), props.getFiles().getMaxFileBytes());
    }

    /* ── writes ────────────────────────────────────────────────────── */

    @Transactional
    public FileResponse createFolder(UUID owner, UUID parentId, String rawName) {
        String name = FileNames.clean(rawName);
        if (parentId != null) requireActiveFolder(owner, parentId);
        if (nameTaken(owner, parentId, name, null)) throw ApiException.conflict("An item with that name already exists here");
        FileNode folder = nodes.save(new FileNode(UUID.randomUUID(), owner, parentId, name, Kind.FOLDER, "inode/directory", 0, clock.instant()));
        return FileResponse.from(folder);
    }

    @Transactional
    public FileResponse upload(UUID owner, UUID parentId, String rawName, byte[] data) {
        String name = FileNames.clean(rawName);
        long max = props.getFiles().getMaxFileBytes();
        if (data.length > max) throw ApiException.payloadTooLarge("Files can be at most " + (max / (1024 * 1024)) + " MB");
        if (parentId != null) requireActiveFolder(owner, parentId);
        ContentSniffer.Verified verified = ContentSniffer.verify(name, data); // by content, not by what the client claims
        if (nodes.totalBytes(owner) + data.length > props.getFiles().getQuotaBytes()) throw ApiException.insufficientStorage("Your storage quota is full");

        String finalName = name;
        for (int i = 2; nameTaken(owner, parentId, finalName, null) && i < 10_000; i++) finalName = FileNames.withSuffix(name, i);
        FileNode node = nodes.save(new FileNode(UUID.randomUUID(), owner, parentId, finalName, Kind.FILE, verified.mimeType(), data.length, clock.instant()));
        contents.save(new FileContent(node.getId(), data));
        log.info("File uploaded: owner={} id={} size={}", owner, node.getId(), data.length); // never log names or content
        return FileResponse.from(node);
    }

    @Transactional
    public FileResponse rename(UUID owner, UUID id, String rawName) {
        FileNode n = requireActive(owner, id);
        String name = FileNames.clean(rawName);
        if (!name.equalsIgnoreCase(n.getName()) && nameTaken(owner, n.getParentId(), name, n.getId())) throw ApiException.conflict("An item with that name already exists here");
        if (n.getKind() == Kind.FILE) {
            String oldExt = ContentSniffer.extensionOf(n.getName());
            if (!oldExt.equals(ContentSniffer.extensionOf(name))) throw ApiException.unprocessable("Changing a file's extension is not allowed");
        }
        n.rename(name, clock.instant());
        return FileResponse.from(n);
    }

    @Transactional
    public FileResponse move(UUID owner, UUID id, UUID newParentId) {
        FileNode n = requireActive(owner, id);
        if (newParentId != null) {
            requireActiveFolder(owner, newParentId);
            if (n.isFolder() && (newParentId.equals(n.getId()) || isDescendant(owner, newParentId, n.getId()))) throw ApiException.conflict("A folder cannot be moved into itself");
        }
        if (java.util.Objects.equals(n.getParentId(), newParentId)) return FileResponse.from(n);
        if (nameTaken(owner, newParentId, n.getName(), n.getId())) throw ApiException.conflict("An item with that name already exists in the destination");
        n.moveTo(newParentId, clock.instant());
        return FileResponse.from(n);
    }

    @Transactional
    public void trash(UUID owner, UUID id) {
        FileNode n = requireActive(owner, id);
        Instant at = clock.instant();
        nodes.markTrashed(owner, subtree(owner, n), at); // the whole subtree shares one timestamp, so restore is exact
    }

    @Transactional
    public FileResponse restore(UUID owner, UUID id) {
        FileNode n = requireOwned(owner, id);
        if (!n.isTrashed()) throw ApiException.conflict("That item is not in the trash");
        Instant at = n.getTrashedAt();
        List<UUID> ids = subtree(owner, n);
        // Original folder gone or trashed? Fall back to the root. Resolve name clashes by renaming.
        UUID parent = n.getParentId();
        if (parent != null) {
            FileNode p = nodes.findOwned(owner, parent).orElse(null);
            if (p == null || p.isTrashed()) n.moveTo(null, clock.instant());
        }
        String name = n.getName();
        for (int i = 2; nameTaken(owner, n.getParentId(), name, n.getId()) && i < 10_000; i++) name = FileNames.withSuffix(n.getName(), i);
        if (!name.equals(n.getName())) n.rename(name, clock.instant());
        nodes.flush();
        nodes.unmarkTrashed(owner, ids, at);
        nodes.flush();
        return FileResponse.from(nodes.findOwned(owner, id).orElseThrow());
    }

    @Transactional
    public void deletePermanently(UUID owner, UUID id) {
        FileNode n = requireOwned(owner, id);
        if (!n.isTrashed()) throw ApiException.conflict("Move the item to the trash before deleting it permanently");
        purge(owner, subtree(owner, n));
    }

    @Transactional
    public int emptyTrash(UUID owner) {
        List<UUID> trashed = nodes.trashedIds(owner);
        if (trashed.isEmpty()) return 0;
        long topLevel = nodes.listTrash(owner, org.springframework.data.domain.Pageable.unpaged()).getTotalElements();
        Set<UUID> all = new HashSet<>(trashed);
        List<UUID> frontier = new ArrayList<>(trashed);
        for (int depth = 0; !frontier.isEmpty() && depth < MAX_DEPTH; depth++) {
            List<UUID> next = new ArrayList<>();
            for (FileNode c : nodes.childrenOf(owner, frontier)) if (all.add(c.getId())) next.add(c.getId());
            frontier = next;
        }
        purge(owner, all);
        return (int) topLevel;
    }

    /* ── helpers ───────────────────────────────────────────────────── */

    private boolean nameTaken(UUID owner, UUID parent, String name, UUID except) {
        UUID ex = except == null ? NIL : except;
        return parent == null ? nodes.nameTakenInRoot(owner, name, ex) : nodes.nameTakenIn(owner, parent, name, ex);
    }

    private void purge(UUID owner, java.util.Collection<UUID> ids) {
        contents.deleteByFileIds(ids);
        nodes.deleteAllOwned(owner, ids);
    }

    /** Node must exist AND belong to the caller; anything else is a 404 so other users' ids can't be probed. */
    private FileNode requireOwned(UUID owner, UUID id) {
        return nodes.findOwned(owner, id).orElseThrow(() -> ApiException.notFound("Item"));
    }

    private FileNode requireActive(UUID owner, UUID id) {
        FileNode n = requireOwned(owner, id);
        if (n.isTrashed()) throw ApiException.notFound("Item");
        return n;
    }

    private FileNode requireActiveFolder(UUID owner, UUID id) {
        FileNode n = requireActive(owner, id);
        if (!n.isFolder()) throw ApiException.badRequest("That is not a folder");
        return n;
    }

    /** All ids in the subtree rooted at {@code root} (including it), breadth-first with a depth bound. */
    private List<UUID> subtree(UUID owner, FileNode root) {
        List<UUID> all = new ArrayList<>();
        all.add(root.getId());
        if (!root.isFolder()) return all;
        List<UUID> frontier = List.of(root.getId());
        for (int depth = 0; !frontier.isEmpty() && depth < MAX_DEPTH; depth++) {
            List<UUID> next = new ArrayList<>();
            for (FileNode c : nodes.childrenOf(owner, frontier)) {
                all.add(c.getId());
                if (c.isFolder()) next.add(c.getId());
            }
            frontier = next;
        }
        return all;
    }

    private boolean isDescendant(UUID owner, UUID candidate, UUID ancestor) {
        UUID cur = candidate;
        for (int depth = 0; cur != null && depth < MAX_DEPTH; depth++) {
            if (cur.equals(ancestor)) return true;
            cur = nodes.findOwned(owner, cur).map(FileNode::getParentId).orElse(null);
        }
        return false;
    }
}
