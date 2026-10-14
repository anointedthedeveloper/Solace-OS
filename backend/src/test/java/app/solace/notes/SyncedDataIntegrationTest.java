package app.solace.notes;

import static app.solace.support.TestClient.json;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.solace.support.IntegrationTest;
import app.solace.support.TestClient;
import org.junit.jupiter.api.Test;

/** CRUD, validation, paging and conflict handling for notes, tasks, events and preferences. */
class SyncedDataIntegrationTest extends IntegrationTest {

    private static String note(String title, String content, long updatedAt) {
        return json("title", title, "content", content, "pinned", false, "archived", false, "createdAt", 1000, "updatedAt", updatedAt);
    }

    private static String task(String title, String due, String priority, long updatedAt) {
        return json("title", title, "details", "", "due", due, "priority", priority, "done", false, "createdAt", 1000, "completedAt", null, "updatedAt", updatedAt);
    }

    private static String event(String title, long start, long end) {
        return json("title", title, "start", start, "end", end, "allDay", false, "location", "", "description", "", "updatedAt", 1);
    }

    /* ── notes ─────────────────────────────────────────────────────── */

    @Test
    void notesCreateReadUpdateDelete() throws Exception {
        TestClient b = signedIn("noter");
        b.put("/api/notes/note_a1", note("Title", "Body", 10)).andExpect(status().isCreated()).andExpect(jsonPath("$.id").value("note_a1")).andExpect(jsonPath("$.content").value("Body"));
        b.get("/api/notes/note_a1").andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Title"));
        b.put("/api/notes/note_a1", note("Title 2", "Body 2", 20)).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Title 2"));
        b.get("/api/notes").andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.totalElements").value(1));
        b.delete("/api/notes/note_a1").andExpect(status().isNoContent());
        b.get("/api/notes/note_a1").andExpect(status().isNotFound());
        b.delete("/api/notes/note_a1").andExpect(status().isNotFound());
        assertCount("notes", 0);
    }

    @Test
    void staleWritesAreRejectedWithConflict() throws Exception {
        TestClient b = signedIn("conflict");
        b.put("/api/notes/note_c", note("Newer", "x", 500)).andExpect(status().isCreated());
        b.put("/api/notes/note_c", note("Older", "x", 100)).andExpect(status().isConflict()).andExpect(jsonPath("$.message").value(containsString("newer")));
        b.get("/api/notes/note_c").andExpect(jsonPath("$.title").value("Newer"));
        b.put("/api/notes/note_c", note("Same time", "x", 500)).andExpect(status().isOk()); // equal timestamps are fine (idempotent retry)
    }

    @Test
    void notesAreValidated() throws Exception {
        TestClient b = signedIn("validator");
        b.put("/api/notes/note_v", json("content", "x", "pinned", false, "archived", false, "createdAt", 1, "updatedAt", 1)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[*].field", hasItem("title")));
        b.put("/api/notes/note_v", note("x".repeat(501), "c", 1)).andExpect(status().isBadRequest());
        b.put("/api/notes/note_v", note("t", "x".repeat(200_001), 1)).andExpect(status().isBadRequest());
        b.put("/api/notes/note_v", note("t", "c", -5)).andExpect(status().isBadRequest());
        b.put("/api/notes/bad%20id", note("t", "c", 1)).andExpect(status().isBadRequest());
        b.put("/api/notes/" + "a".repeat(65), note("t", "c", 1)).andExpect(status().isBadRequest());
        b.put("/api/notes/note_ok", "[1,2]").andExpect(status().isBadRequest());
        assertCount("notes", 0);
    }

    @Test
    void listingIsPaginatedAndBounded() throws Exception {
        TestClient b = signedIn("pager");
        for (int i = 0; i < 25; i++) b.put("/api/notes/note_" + String.format("%02d", i), note("n" + i, "c", i + 1)).andExpect(status().isCreated());
        b.get("/api/notes?page=0&size=10").andExpect(jsonPath("$.items", hasSize(10))).andExpect(jsonPath("$.totalElements").value(25)).andExpect(jsonPath("$.totalPages").value(3));
        b.get("/api/notes?page=2&size=10").andExpect(jsonPath("$.items", hasSize(5)));
        b.get("/api/notes?page=1&size=100000").andExpect(jsonPath("$.size").value(200)); // clamped
        b.get("/api/notes?page=-4&size=0").andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(1));
    }

    @Test
    void largeNotesSurviveARoundTrip() throws Exception {
        TestClient b = signedIn("bignote");
        String big = "Ünïcödé 🚀 ".repeat(10_000);
        b.put("/api/notes/note_big", note("big", big, 1)).andExpect(status().isCreated());
        b.get("/api/notes/note_big").andExpect(jsonPath("$.content").value(big));
    }

    /* ── tasks ─────────────────────────────────────────────────────── */

    @Test
    void tasksCrudWithDueDatesAndPriorities() throws Exception {
        TestClient b = signedIn("tasker");
        b.put("/api/tasks/task_1", task("Pay rent", "2030-01-31", "high", 10)).andExpect(status().isCreated()).andExpect(jsonPath("$.due").value("2030-01-31")).andExpect(jsonPath("$.priority").value("high"));
        b.put("/api/tasks/task_2", task("Someday", null, "low", 10)).andExpect(status().isCreated()).andExpect(jsonPath("$.due").doesNotExist());
        b.put("/api/tasks/task_1", json("title", "Pay rent", "details", "", "due", "2030-01-31", "priority", "high", "done", true, "createdAt", 1000, "completedAt", 2000, "updatedAt", 20))
                .andExpect(status().isOk()).andExpect(jsonPath("$.done").value(true)).andExpect(jsonPath("$.completedAt").value(2000));
        b.get("/api/tasks").andExpect(jsonPath("$.items", hasSize(2)));
        b.delete("/api/tasks/task_2").andExpect(status().isNoContent());
        b.get("/api/tasks/task_2").andExpect(status().isNotFound());
    }

    @Test
    void tasksAreValidated() throws Exception {
        TestClient b = signedIn("taskval");
        b.put("/api/tasks/t1", task("", "2030-01-01", "high", 1)).andExpect(status().isBadRequest());
        b.put("/api/tasks/t1", task("   ", "2030-01-01", "high", 1)).andExpect(status().isBadRequest());
        b.put("/api/tasks/t1", task("ok", "2030-01-01", "urgent", 1)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[*].field", hasItem("priority")));
        b.put("/api/tasks/t1", task("ok", "tomorrow", "low", 1)).andExpect(status().isBadRequest());
        b.put("/api/tasks/t1", task("x".repeat(201), "2030-01-01", "low", 1)).andExpect(status().isBadRequest());
        b.put("/api/tasks/t1", task("older", "2030-01-01", "low", 5)).andExpect(status().isCreated());
        b.put("/api/tasks/t1", task("older", "2030-01-01", "low", 4)).andExpect(status().isConflict());
        assertCount("tasks", 1);
    }

    /* ── events ────────────────────────────────────────────────────── */

    @Test
    void eventsCrudAndOrdering() throws Exception {
        TestClient b = signedIn("evter");
        b.put("/api/events/evt_b", event("Later", 2_000_000, 3_000_000)).andExpect(status().isCreated());
        b.put("/api/events/evt_a", event("Earlier", 1_000_000, 1_500_000)).andExpect(status().isCreated());
        b.get("/api/events").andExpect(jsonPath("$.items[0].title").value("Earlier")).andExpect(jsonPath("$.items[1].title").value("Later"));
        b.put("/api/events/evt_a", event("Renamed", 1_000_000, 1_500_000)).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Renamed"));
        b.delete("/api/events/evt_a").andExpect(status().isNoContent());
        b.get("/api/events").andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    void eventsRejectEndsBeforeStarts() throws Exception {
        TestClient b = signedIn("evval");
        b.put("/api/events/e1", event("Backwards", 5000, 1000)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[*].message", hasItem("The end must not be before the start")));
        b.put("/api/events/e1", event("", 1, 2)).andExpect(status().isBadRequest());
        b.put("/api/events/e1", event("ok", 1, 1)).andExpect(status().isCreated()); // instantaneous / all-day style events are allowed
    }

    /* ── preferences ───────────────────────────────────────────────── */

    @Test
    void preferencesRoundTrip() throws Exception {
        TestClient b = signedIn("prefs");
        b.get("/api/preferences").andExpect(status().isNoContent());
        b.put("/api/preferences", "{\"theme\":\"light\",\"dock\":{\"position\":\"left\"}}").andExpect(status().isOk()).andExpect(jsonPath("$.data.theme").value("light"));
        b.get("/api/preferences").andExpect(status().isOk()).andExpect(jsonPath("$.data.dock.position").value("left")).andExpect(jsonPath("$.updatedAt").exists());
        b.put("/api/preferences", "{\"theme\":\"dark\"}").andExpect(status().isOk());
        b.get("/api/preferences").andExpect(jsonPath("$.data.theme").value("dark")).andExpect(jsonPath("$.data.dock").doesNotExist());
        assertCount("preferences", 1);
    }

    @Test
    void preferencesMustBeASmallJsonObject() throws Exception {
        TestClient b = signedIn("prefsval");
        b.put("/api/preferences", "[1,2,3]").andExpect(status().isBadRequest());
        b.put("/api/preferences", "\"string\"").andExpect(status().isBadRequest());
        b.put("/api/preferences", "{\"blob\":\"" + "x".repeat(17 * 1024) + "\"}").andExpect(status().isPayloadTooLarge());
        b.put("/api/preferences", "{broken").andExpect(status().isBadRequest());
        assertCount("preferences", 0);
    }

    @Test
    void persistedDataSurvivesANewSession() throws Exception {
        TestClient first = signedIn("persist");
        first.put("/api/notes/note_p", note("Keep", "me", 1)).andExpect(status().isCreated());
        first.postEmpty("/api/auth/logout");
        TestClient second = browser();
        second.post("/api/auth/login", json("username", "persist", "password", PASSWORD)).andExpect(status().isOk());
        second.get("/api/notes/note_p").andExpect(status().isOk()).andExpect(jsonPath("$.content").value("me"));
    }
}
