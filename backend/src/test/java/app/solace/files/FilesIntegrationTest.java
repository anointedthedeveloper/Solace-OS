package app.solace.files;

import static app.solace.support.TestClient.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.solace.support.IntegrationTest;
import app.solace.support.TestClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/** Server-managed files: persistence, validation of content, quota, trash and tree operations. */
class FilesIntegrationTest extends IntegrationTest {
    private final ObjectMapper om = new ObjectMapper();
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};

    private String id(ResultActions r) throws Exception {
        return om.readTree(r.andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String folder(TestClient b, String parent, String name) throws Exception {
        return id(b.post("/api/files/folders", parent == null ? json("name", name) : json("parentId", parent, "name", name)).andExpect(status().isCreated()));
    }

    @Test
    void uploadedFilesAreStoredAndComeBackByteForByte() throws Exception {
        TestClient b = signedIn("filer");
        byte[] data = "héllo\nwörld ✓".getBytes(StandardCharsets.UTF_8);
        String id = id(b.upload("/api/files", "greeting.txt", data, null).andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("greeting.txt")).andExpect(jsonPath("$.kind").value("file")).andExpect(jsonPath("$.mimeType").value("text/plain")).andExpect(jsonPath("$.size").value(data.length)));
        byte[] back = b.get("/api/files/" + id + "/content").andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(back).isEqualTo(data);
        assertCount("file_contents", 1);
    }

    @Test
    void downloadsAreAlwaysAttachmentsWithNosniffAndAServerChosenType() throws Exception {
        TestClient b = signedIn("downloader");
        String id = id(b.upload("/api/files", "page.txt", "<script>alert(1)</script>".getBytes(), null).andExpect(status().isCreated()));
        b.get("/api/files/" + id + "/content")
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/plain"))
                .andExpect(header().string("Content-Disposition", containsString("attachment")))
                .andExpect(header().string("Content-Disposition", containsString("page.txt")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", containsString("no-store")));
        String png = id(b.upload("/api/files", "pic.png", PNG, null).andExpect(status().isCreated()));
        b.get("/api/files/" + png + "/content").andExpect(header().string("Content-Type", "image/png")).andExpect(header().string("Content-Disposition", containsString("attachment")));
    }

    @Test
    void contentMustMatchTheDeclaredType() throws Exception {
        TestClient b = signedIn("sniff");
        b.upload("/api/files", "fake.png", "this is not a png".getBytes(), null).andExpect(status().isUnprocessableEntity());
        b.upload("/api/files", "real.png", PNG, null).andExpect(status().isCreated());
        b.upload("/api/files", "run.txt", new byte[] {'M', 'Z', 0, 0}, null).andExpect(status().isUnprocessableEntity());
        b.upload("/api/files", "binary.txt", new byte[] {'a', 0, 'b'}, null).andExpect(status().isUnprocessableEntity());
        b.upload("/api/files", "virus.exe", "MZ".getBytes(), null).andExpect(status().isUnprocessableEntity());
        b.upload("/api/files", "page.html", "<html></html>".getBytes(), null).andExpect(status().isUnprocessableEntity());
        b.upload("/api/files", "image.svg", "<svg onload=alert(1)/>".getBytes(), null).andExpect(status().isUnprocessableEntity());
        assertCount("file_nodes", 1);
    }

    @Test
    void hostileFilenamesAreNeutralised() throws Exception {
        TestClient b = signedIn("names");
        // Path components are stripped; the file lands under its base name only.
        b.upload("/api/files", "../../etc/passwd.txt", "x".getBytes(), null).andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("passwd.txt"));
        b.upload("/api/files", "C:\\Windows\\evil.txt", "x".getBytes(), null).andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("evil.txt"));
        b.upload("/api/files", "..", "x".getBytes(), null).andExpect(status().isBadRequest());
        b.upload("/api/files", "", "x".getBytes(), null).andExpect(status().isBadRequest());
        b.upload("/api/files", "x".repeat(130) + ".txt", "x".getBytes(), null).andExpect(status().isBadRequest());
        b.post("/api/files/folders", json("name", "../up")).andExpect(status().isBadRequest());
        b.post("/api/files/folders", json("name", "a:b")).andExpect(status().isBadRequest());
        b.post("/api/files/folders", json("name", "  ")).andExpect(status().isBadRequest());
        b.post("/api/files/folders", "{}").andExpect(status().isBadRequest());
    }

    @Test
    void sizeLimitAndQuotaAreEnforcedOnTheServer() throws Exception {
        TestClient b = signedIn("quota"); // test profile: 4 KiB per file, 10,000 bytes total
        b.upload("/api/files", "big.txt", "x".repeat(4097).getBytes(), null).andExpect(status().isPayloadTooLarge());
        b.upload("/api/files", "a.txt", "x".repeat(4000).getBytes(), null).andExpect(status().isCreated());
        b.upload("/api/files", "b.txt", "x".repeat(4000).getBytes(), null).andExpect(status().isCreated());
        b.upload("/api/files", "c.txt", "x".repeat(3000).getBytes(), null).andExpect(status().is(507));
        b.get("/api/files/usage").andExpect(jsonPath("$.usedBytes").value(8000)).andExpect(jsonPath("$.quotaBytes").value(10000)).andExpect(jsonPath("$.maxFileBytes").value(4096));
        assertCount("file_nodes", 2);
    }

    @Test
    void uploadsWithTheSameNameAreRenamedNotOverwritten() throws Exception {
        TestClient b = signedIn("dupes");
        b.upload("/api/files", "report.txt", "one".getBytes(), null).andExpect(jsonPath("$.name").value("report.txt"));
        b.upload("/api/files", "report.txt", "two".getBytes(), null).andExpect(jsonPath("$.name").value("report (2).txt"));
        b.upload("/api/files", "REPORT.TXT", "three".getBytes(), null).andExpect(jsonPath("$.name").value("REPORT (3).TXT"));
        b.get("/api/files").andExpect(jsonPath("$.items", hasSize(3)));
    }

    @Test
    void foldersListFoldersFirstAndRejectDuplicates() throws Exception {
        TestClient b = signedIn("tree");
        b.upload("/api/files", "a.txt", "x".getBytes(), null);
        String docs = folder(b, null, "Docs");
        folder(b, null, "Archive");
        b.post("/api/files/folders", json("name", "docs")).andExpect(status().isConflict()); // case-insensitive
        b.get("/api/files").andExpect(jsonPath("$.items[0].name").value("Archive")).andExpect(jsonPath("$.items[1].name").value("Docs")).andExpect(jsonPath("$.items[2].name").value("a.txt"));
        b.upload("/api/files", "nested.txt", "x".getBytes(), docs).andExpect(status().isCreated()).andExpect(jsonPath("$.parentId").value(docs));
        b.get("/api/files?parentId=" + docs).andExpect(jsonPath("$.items", hasSize(1)));
        String nestedFile = id(b.upload("/api/files", "f.txt", "x".getBytes(), docs));
        b.post("/api/files/folders", json("parentId", nestedFile, "name", "child")).andExpect(status().isBadRequest()); // parent must be a folder
        b.get("/api/files?parentId=" + nestedFile).andExpect(status().isBadRequest());
    }

    @Test
    void renameKeepsTheExtensionAndRespectsUniqueness() throws Exception {
        TestClient b = signedIn("renamer");
        String a = id(b.upload("/api/files", "a.txt", "x".getBytes(), null));
        b.upload("/api/files", "b.txt", "x".getBytes(), null);
        b.patch("/api/files/" + a, json("name", "c.txt")).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("c.txt"));
        b.patch("/api/files/" + a, json("name", "B.TXT")).andExpect(status().isConflict());
        b.patch("/api/files/" + a, json("name", "c.exe")).andExpect(status().isUnprocessableEntity());
        b.patch("/api/files/" + a, json("name", "../x.txt")).andExpect(status().isBadRequest());
        b.patch("/api/files/" + a, "{}").andExpect(status().isBadRequest());
        b.patch("/api/files/" + a, json("name", "C.txt")).andExpect(status().isOk()); // changing only the case is fine
    }

    @Test
    void movingWorksButNeverCreatesCycles() throws Exception {
        TestClient b = signedIn("mover");
        String parent = folder(b, null, "Parent");
        String child = folder(b, parent, "Child");
        String grandchild = folder(b, child, "Grandchild");
        String file = id(b.upload("/api/files", "f.txt", "x".getBytes(), null));

        b.patch("/api/files/" + file, json("move", true, "parentId", grandchild)).andExpect(status().isOk()).andExpect(jsonPath("$.parentId").value(grandchild));
        b.patch("/api/files/" + file, json("move", true, "parentId", null)).andExpect(status().isOk());
        b.patch("/api/files/" + parent, json("move", true, "parentId", parent)).andExpect(status().isConflict());
        b.patch("/api/files/" + parent, json("move", true, "parentId", grandchild)).andExpect(status().isConflict());
        b.patch("/api/files/" + file, json("move", true, "parentId", file)).andExpect(status().isBadRequest()); // a file isn't a folder
        b.upload("/api/files", "f.txt", "y".getBytes(), parent); // name clash target
        b.patch("/api/files/" + file, json("move", true, "parentId", parent)).andExpect(status().isConflict());
    }

    @Test
    void trashRestoreAndPermanentDelete() throws Exception {
        TestClient b = signedIn("trasher");
        String dir = folder(b, null, "Box");
        String inner = id(b.upload("/api/files", "inner.txt", "keep".getBytes(), dir));
        String loose = id(b.upload("/api/files", "loose.txt", "x".getBytes(), null));

        b.delete("/api/files/" + dir).andExpect(status().isNoContent());
        b.get("/api/files").andExpect(jsonPath("$.items", hasSize(1))); // only loose.txt left
        b.get("/api/files/" + inner + "/content").andExpect(status().isNotFound()); // inside a trashed folder
        b.get("/api/files/trash").andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].name").value("Box")); // top level only
        b.delete("/api/files/" + loose + "?permanent=true").andExpect(status().isConflict()); // must be in trash first
        b.postEmpty("/api/files/" + loose + "/restore").andExpect(status().isConflict()); // not trashed

        b.postEmpty("/api/files/" + dir + "/restore").andExpect(status().isOk()).andExpect(jsonPath("$.trashedAt").doesNotExist());
        b.get("/api/files/" + inner + "/content").andExpect(status().isOk()).andExpect(content().string("keep"));

        b.delete("/api/files/" + dir).andExpect(status().isNoContent());
        b.delete("/api/files/" + dir + "?permanent=true").andExpect(status().isNoContent());
        assertCount("file_nodes", 1); // only loose.txt remains
        assertCount("file_contents", 1);
        b.get("/api/files/trash").andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    void restoreRenamesOnConflictAndFallsBackToRoot() throws Exception {
        TestClient b = signedIn("restorer");
        String a = id(b.upload("/api/files", "same.txt", "1".getBytes(), null));
        b.delete("/api/files/" + a).andExpect(status().isNoContent());
        b.upload("/api/files", "same.txt", "2".getBytes(), null); // takes the name while a is in the trash
        b.postEmpty("/api/files/" + a + "/restore").andExpect(status().isOk()).andExpect(jsonPath("$.name").value("same (2).txt"));

        String dir = folder(b, null, "Gone");
        String f = id(b.upload("/api/files", "orphan.txt", "x".getBytes(), dir));
        b.delete("/api/files/" + f).andExpect(status().isNoContent());
        b.delete("/api/files/" + dir).andExpect(status().isNoContent());
        b.postEmpty("/api/files/" + f + "/restore").andExpect(status().isOk()).andExpect(jsonPath("$.parentId").doesNotExist()); // parent is trashed → root
    }

    @Test
    void emptyTrashRemovesEverythingInIt() throws Exception {
        TestClient b = signedIn("emptier");
        String dir = folder(b, null, "D");
        b.upload("/api/files", "in.txt", "x".getBytes(), dir);
        String f = id(b.upload("/api/files", "f.txt", "x".getBytes(), null));
        b.upload("/api/files", "stay.txt", "x".getBytes(), null);
        b.delete("/api/files/" + dir);
        b.delete("/api/files/" + f);
        b.delete("/api/files/trash").andExpect(status().isOk()).andExpect(jsonPath("$.deleted").value(2));
        assertCount("file_nodes", 1);
        assertCount("file_contents", 1);
        b.get("/api/files/usage").andExpect(jsonPath("$.usedBytes").value(1));
    }

    @Test
    void trashedItemsCannotBeChanged() throws Exception {
        TestClient b = signedIn("frozen");
        String f = id(b.upload("/api/files", "x.txt", "x".getBytes(), null));
        b.delete("/api/files/" + f);
        b.patch("/api/files/" + f, json("name", "y.txt")).andExpect(status().isNotFound());
        b.get("/api/files/" + f + "/content").andExpect(status().isNotFound());
        b.delete("/api/files/" + f).andExpect(status().isNotFound()); // already trashed: not an active item
    }

    @Test
    void foldersCannotBeDownloaded() throws Exception {
        TestClient b = signedIn("folderdl");
        String d = folder(b, null, "Dir");
        b.get("/api/files/" + d + "/content").andExpect(status().isBadRequest());
        b.get("/api/files/" + d).andExpect(jsonPath("$.kind").value("folder"));
    }

    @Test
    void listingSupportsPaging() throws Exception {
        TestClient b = signedIn("lister");
        for (int i = 0; i < 7; i++) b.upload("/api/files", "f" + i + ".txt", "x".getBytes(), null);
        b.get("/api/files?size=3&page=0").andExpect(jsonPath("$.items", hasSize(3))).andExpect(jsonPath("$.totalElements").value(7)).andExpect(jsonPath("$.totalPages").value(3));
        b.get("/api/files?size=3&page=2").andExpect(jsonPath("$.items", hasSize(1)));
        b.get("/api/files?size=3&page=0").andExpect(jsonPath("$.items[*].name", hasItems("f0.txt", "f1.txt", "f2.txt")));
    }

    @Test
    void uploadWithoutAFilePartIsABadRequest() throws Exception {
        TestClient b = signedIn("nofile");
        b.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/files")).andExpect(status().isBadRequest());
    }
}
