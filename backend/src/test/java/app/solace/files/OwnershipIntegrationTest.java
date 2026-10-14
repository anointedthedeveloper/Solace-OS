package app.solace.files;

import static app.solace.support.TestClient.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.solace.support.IntegrationTest;
import app.solace.support.TestClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** One user must never be able to see, change or even detect another user's private data. */
class OwnershipIntegrationTest extends IntegrationTest {
    private final ObjectMapper om = new ObjectMapper();

    private String id(org.springframework.test.web.servlet.ResultActions r) throws Exception {
        JsonNode n = om.readTree(r.andReturn().getResponse().getContentAsString());
        return n.get("id").asText();
    }

    private static final String NOTE = json("title", "Alice's secret", "content", "private", "pinned", false, "archived", false, "createdAt", 1, "updatedAt", 10);
    private static final String TASK = json("title", "Alice task", "details", "", "due", null, "priority", "low", "done", false, "createdAt", 1, "completedAt", null, "updatedAt", 10);
    private static final String EVENT = json("title", "Alice event", "start", 1, "end", 2, "allDay", false, "location", "", "description", "", "updatedAt", 10);

    @Test
    void usersNeverSeeEachOthersNotesTasksOrEvents() throws Exception {
        TestClient alice = signedIn("alice");
        TestClient bob = signedIn("bobby");
        alice.put("/api/notes/note_1", NOTE).andExpect(status().isCreated());
        alice.put("/api/tasks/task_1", TASK).andExpect(status().isCreated());
        alice.put("/api/events/evt_1", EVENT).andExpect(status().isCreated());

        for (String kind : new String[] {"notes/note_1", "tasks/task_1", "events/evt_1"}) {
            bob.get("/api/" + kind).andExpect(status().isNotFound());
            bob.delete("/api/" + kind).andExpect(status().isNotFound());
        }
        bob.get("/api/notes").andExpect(jsonPath("$.items", hasSize(0)));
        bob.get("/api/tasks").andExpect(jsonPath("$.items", hasSize(0)));
        bob.get("/api/events").andExpect(jsonPath("$.items", hasSize(0)));

        // Alice's data is untouched by Bob's attempts.
        alice.get("/api/notes/note_1").andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Alice's secret"));
        assertCount("notes", 1);
        assertCount("tasks", 1);
        assertCount("events", 1);
    }

    @Test
    void writingToSomeoneElsesIdCreatesYourOwnRowAndNeverOverwritesTheirs() throws Exception {
        TestClient alice = signedIn("alice2");
        TestClient bob = signedIn("bobby2");
        alice.put("/api/notes/shared_id", NOTE).andExpect(status().isCreated());
        // Same client-chosen id, different account: an independent row (ids are scoped per user).
        bob.put("/api/notes/shared_id", json("title", "Bob's note", "content", "mine", "pinned", false, "archived", false, "createdAt", 1, "updatedAt", 5)).andExpect(status().isCreated());
        alice.get("/api/notes/shared_id").andExpect(jsonPath("$.title").value("Alice's secret"));
        bob.get("/api/notes/shared_id").andExpect(jsonPath("$.title").value("Bob's note"));
        assertCount("notes", 2);
    }

    @Test
    void preferencesArePerUser() throws Exception {
        TestClient alice = signedIn("alice3");
        TestClient bob = signedIn("bobby3");
        alice.put("/api/preferences", "{\"theme\":\"light\"}").andExpect(status().isOk());
        bob.get("/api/preferences").andExpect(status().isNoContent());
        bob.put("/api/preferences", "{\"theme\":\"dark\"}").andExpect(status().isOk());
        alice.get("/api/preferences").andExpect(jsonPath("$.data.theme").value("light"));
    }

    @Test
    void usersNeverReachEachOthersFiles() throws Exception {
        TestClient alice = signedIn("alice4");
        TestClient bob = signedIn("bobby4");
        String folder = id(alice.post("/api/files/folders", json("name", "Private")).andExpect(status().isCreated()));
        String file = id(alice.upload("/api/files", "secret.txt", "top secret".getBytes(), folder).andExpect(status().isCreated()));

        bob.get("/api/files/" + file).andExpect(status().isNotFound());
        bob.get("/api/files/" + file + "/content").andExpect(status().isNotFound());
        bob.get("/api/files?parentId=" + folder).andExpect(status().isNotFound());
        bob.patch("/api/files/" + file, json("name", "stolen.txt")).andExpect(status().isNotFound());
        bob.patch("/api/files/" + file, json("move", true, "parentId", null)).andExpect(status().isNotFound());
        bob.delete("/api/files/" + file).andExpect(status().isNotFound());
        bob.delete("/api/files/" + file + "?permanent=true").andExpect(status().isNotFound());
        bob.postEmpty("/api/files/" + file + "/restore").andExpect(status().isNotFound());
        bob.get("/api/files").andExpect(jsonPath("$.items", hasSize(0)));
        bob.get("/api/files/usage").andExpect(jsonPath("$.usedBytes").value(0));

        // Bob can't plant things inside Alice's folder, or move his own file into it.
        bob.post("/api/files/folders", json("parentId", folder, "name", "planted")).andExpect(status().isNotFound());
        bob.upload("/api/files", "planted.txt", "x".getBytes(), folder).andExpect(status().isNotFound());
        String bobsFile = id(bob.upload("/api/files", "mine.txt", "mine".getBytes(), null).andExpect(status().isCreated()));
        bob.patch("/api/files/" + bobsFile, json("move", true, "parentId", folder)).andExpect(status().isNotFound());

        alice.get("/api/files/" + file + "/content").andExpect(status().isOk());
        alice.get("/api/files?parentId=" + folder).andExpect(jsonPath("$.items", hasSize(1)));
        assertThat(count("file_nodes")).isEqualTo(3);
    }

    @Test
    void bobCannotEmptyOrListAlicesTrash() throws Exception {
        TestClient alice = signedIn("alice5");
        TestClient bob = signedIn("bobby5");
        String file = id(alice.upload("/api/files", "t.txt", "x".getBytes(), null));
        alice.delete("/api/files/" + file).andExpect(status().isNoContent());
        bob.get("/api/files/trash").andExpect(jsonPath("$.items", hasSize(0)));
        bob.delete("/api/files/trash").andExpect(jsonPath("$.deleted").value(0));
        alice.get("/api/files/trash").andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    void profileChangesOnlyAffectTheCaller() throws Exception {
        TestClient alice = signedIn("alice6");
        TestClient bob = signedIn("bobby6");
        bob.patch("/api/users/me", json("displayName", "Renamed")).andExpect(status().isOk());
        alice.get("/api/auth/me").andExpect(jsonPath("$.displayName").value("alice6"));
    }
}
