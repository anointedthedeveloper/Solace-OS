package app.solace.auth;

import static app.solace.support.TestClient.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.solace.support.IntegrationTest;
import app.solace.support.TestClient;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

class AuthIntegrationTest extends IntegrationTest {
    private static final String PASS = "correct horse battery staple";

    @Test
    void registrationCreatesAnAccountAndASession() throws Exception {
        TestClient b = browser();
        b.post("/api/auth/register", json("username", "Ada", "password", PASS, "displayName", "Ada L"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("Ada"))
                .andExpect(jsonPath("$.displayName").value("Ada L"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        b.get("/api/auth/session").andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true)).andExpect(jsonPath("$.user.username").value("Ada"));
        assertCount("users", 1);
    }

    @Test
    void passwordsAreStoredAsBcryptHashesOnly() throws Exception {
        signedIn("hashcheck");
        String stored = jdbc.queryForObject("select password_hash from users", String.class);
        assertThat(stored).startsWith("$2").doesNotContain("passphrase");
    }

    @Test
    void stateChangingRequestsWithoutACsrfTokenAreRejected() throws Exception {
        TestClient b = browser().withoutCsrf();
        b.post("/api/auth/register", json("username", "nocsrf", "password", PASS)).andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value(containsString("CSRF")));
        assertCount("users", 0);
        TestClient c = signedIn("victim");
        c.withoutCsrf().put("/api/notes/note_1", json("title", "t", "content", "c", "pinned", false, "archived", false, "createdAt", 1, "updatedAt", 1)).andExpect(status().isForbidden());
        c.withoutCsrf().delete("/api/users/me").andExpect(status().isForbidden());
    }

    @Test
    void aWrongCsrfTokenIsRejectedToo() throws Exception {
        TestClient b = signedIn("wrongcsrf");
        mvc.perform(post("/api/auth/logout").session(b.session()).cookie(b.cookies().values().toArray(new Cookie[0])).header("X-XSRF-TOKEN", "forged")).andExpect(status().isForbidden());
    }

    @Test
    void loginWorksAndTheCookieIsRequiredAfterwards() throws Exception {
        signedIn("loginuser");
        TestClient other = browser();
        other.post("/api/auth/login", json("username", "LOGINUSER", "password", "correct horse battery staple")).andExpect(status().isOk()).andExpect(jsonPath("$.username").value("loginuser"));
        other.get("/api/auth/session").andExpect(jsonPath("$.authenticated").value(true));
        browser().get("/api/auth/session").andExpect(jsonPath("$.authenticated").value(false));
    }

    @Test
    void loginFailureIsGenericAndDoesNotRevealWhetherTheUserExists() throws Exception {
        signedIn("realuser");
        String wrongPassword = browser().post("/api/auth/login", json("username", "realuser", "password", "definitely the wrong one")).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        String unknownUser = browser().post("/api/auth/login", json("username", "nobodyhere", "password", "definitely the wrong one")).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertThat(jsonField(wrongPassword, "message")).isEqualTo(jsonField(unknownUser, "message")).isEqualTo("Invalid username or password");
    }

    private static String jsonField(String body, String field) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"" + field + "\":\"([^\"]*)\"").matcher(body);
        return m.find() ? m.group(1) : null;
    }

    @Test
    void repeatedFailedLoginsTriggerRateLimitingWithRetryAfter() throws Exception {
        signedIn("target");
        for (int i = 0; i < 3; i++) browser().post("/api/auth/login", json("username", "target", "password", "bad guess number " + i)).andExpect(status().isUnauthorized());
        browser().post("/api/auth/login", json("username", "target", "password", "correct horse battery staple"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.status").value(429));
    }

    @Test
    void logoutEndsTheServerSideSession() throws Exception {
        TestClient b = signedIn("leaver");
        MockHttpSession session = b.session();
        assertThat(session).isNotNull();
        b.postEmpty("/api/auth/logout").andExpect(status().isNoContent());
        b.get("/api/auth/session").andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(false)).andExpect(jsonPath("$.user").doesNotExist());
        // Replaying the old session must not work either: it is dead on the server.
        assertThat(session.isInvalid()).isTrue();
        mvc.perform(get("/api/auth/session").session(session)).andExpect(jsonPath("$.authenticated").value(false));
        mvc.perform(get("/api/notes").session(session)).andExpect(status().isUnauthorized());
    }

    @Test
    void loginIssuesANewSessionIdToPreventFixation() throws Exception {
        signedIn("fixation");
        MockHttpSession attackerPlanted = new MockHttpSession();
        attackerPlanted.setAttribute("planted", true);
        String before = attackerPlanted.getId();
        TestClient b = browser();
        b.useSession(attackerPlanted);
        b.post("/api/auth/login", json("username", "fixation", "password", "correct horse battery staple")).andExpect(status().isOk());
        assertThat(b.session().getId()).as("session id must change on login").isNotEqualTo(before);
        b.get("/api/auth/session").andExpect(jsonPath("$.authenticated").value(true));
    }

    @Test
    void registrationValidatesInput() throws Exception {
        TestClient b = browser();
        b.post("/api/auth/register", json("username", "ab", "password", PASS)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[*].field", hasItem("username")));
        b.post("/api/auth/register", json("username", "bad name!", "password", PASS)).andExpect(status().isBadRequest());
        b.post("/api/auth/register", json("username", "gooduser", "password", "short")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[*].field", hasItem("password")));
        b.post("/api/auth/register", json("username", "gooduser", "password", "x".repeat(73))).andExpect(status().isBadRequest());
        b.post("/api/auth/register", json("username", "gooduser", "password", "password123")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(containsString("common")));
        b.post("/api/auth/register", json("username", "gooduser", "password", PASS, "displayName", "<script>")).andExpect(status().isBadRequest());
        b.post("/api/auth/register", "{}").andExpect(status().isBadRequest());
        b.post("/api/auth/register", "not json").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(not(containsString("Exception"))));
        assertCount("users", 0);
    }

    @Test
    void duplicateUsernamesConflictCaseInsensitively() throws Exception {
        signedIn("Taken");
        browser().post("/api/auth/register", json("username", "tAKEN", "password", PASS)).andExpect(status().isConflict());
        assertCount("users", 1);
    }

    @Test
    void everyProtectedEndpointRequiresAuthentication() throws Exception {
        String id = "note_1";
        String uuid = "00000000-0000-0000-0000-000000000001";
        TestClient anon = browser();
        for (String url : new String[] {"/api/notes", "/api/notes/" + id, "/api/tasks", "/api/tasks/" + id, "/api/events", "/api/events/" + id, "/api/preferences", "/api/files", "/api/files/trash", "/api/files/usage", "/api/files/" + uuid, "/api/files/" + uuid + "/content"}) {
            anon.get(url).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401));
        }
        String note = json("title", "t", "content", "c", "pinned", false, "archived", false, "createdAt", 1, "updatedAt", 1);
        anon.put("/api/notes/" + id, note).andExpect(status().isUnauthorized());
        anon.put("/api/preferences", "{}").andExpect(status().isUnauthorized());
        anon.delete("/api/notes/" + id).andExpect(status().isUnauthorized());
        anon.post("/api/files/folders", json("name", "x")).andExpect(status().isUnauthorized());
        anon.upload("/api/files", "a.txt", "x".getBytes(), null).andExpect(status().isUnauthorized());
        anon.patch("/api/users/me", json("displayName", "x")).andExpect(status().isUnauthorized());
        anon.delete("/api/users/me").andExpect(status().isUnauthorized());
    }

    @Test
    void unknownPathsAndActuatorInternalsAreNotExposed() throws Exception {
        TestClient b = signedIn("probe");
        b.get("/api/does-not-exist").andExpect(status().isNotFound());
        mvc.perform(get("/actuator/env")).andExpect(status().is4xxClientError());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP")).andExpect(jsonPath("$.components").doesNotExist());
        mvc.perform(get("/swagger-ui/index.html")).andExpect(status().is4xxClientError()); // docs are off by default
        mvc.perform(get("/")).andExpect(status().is4xxClientError()); // nothing but the API is served
    }

    @Test
    void apiResponsesCarrySecurityHeaders() throws Exception {
        TestClient b = signedIn("headers");
        b.get("/api/auth/session")
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Security-Policy", containsString("default-src 'none'")))
                .andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'none'")))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("Permissions-Policy", containsString("camera=()")));
    }

    @Test
    void errorsHaveOneConsistentShapeAndLeakNothing() throws Exception {
        TestClient b = signedIn("errors");
        b.get("/api/notes/bad id!").andExpect(status().isBadRequest());
        b.get("/api/files/not-a-uuid").andExpect(status().isBadRequest()).andExpect(jsonPath("$.timestamp").exists()).andExpect(jsonPath("$.path").value("/api/files/not-a-uuid"));
        b.get("/api/notes/missing").andExpect(status().isNotFound()).andExpect(jsonPath("$.error").value("Not Found")).andExpect(jsonPath("$.status").value(404));
        mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content("{}").session(b.session()).cookie(b.cookies().values().toArray(new Cookie[0])).header("X-XSRF-TOKEN", b.cookie("XSRF-TOKEN").getValue()))
                .andExpect(status().isMethodNotAllowed()).andExpect(jsonPath("$.message").value(equalTo("Method not allowed")));
    }

    @Test
    void profileCanBeUpdatedAndValidated() throws Exception {
        TestClient b = signedIn("profile");
        b.patch("/api/users/me", json("displayName", "New Name")).andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("New Name"));
        b.get("/api/auth/session").andExpect(jsonPath("$.user.displayName").value("New Name"));
        b.patch("/api/users/me", json("displayName", "x".repeat(41))).andExpect(status().isBadRequest());
        b.patch("/api/users/me", json("displayName", "<b>")).andExpect(status().isBadRequest());
    }

    @Test
    void deletingAnAccountRequiresThePasswordAndRemovesEverything() throws Exception {
        TestClient b = signedIn("goner");
        b.put("/api/notes/note_1", json("title", "t", "content", "c", "pinned", false, "archived", false, "createdAt", 1, "updatedAt", 1)).andExpect(status().isCreated());
        b.post("/api/files/folders", json("name", "Stuff")).andExpect(status().isCreated());
        b.upload("/api/files", "a.txt", "hello".getBytes(), null).andExpect(status().isCreated());
        b.put("/api/preferences", "{\"theme\":\"light\"}").andExpect(status().isOk());

        b.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/users/me").contentType(MediaType.APPLICATION_JSON).content(json("password", "not my password"))).andExpect(status().isBadRequest());
        assertCount("users", 1);
        b.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/users/me").contentType(MediaType.APPLICATION_JSON).content(json("password", "correct horse battery staple"))).andExpect(status().isNoContent());

        for (String table : new String[] {"users", "notes", "tasks", "events", "preferences", "file_nodes", "file_contents"}) assertCount(table, 0);
        b.get("/api/auth/session").andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(false)).andExpect(jsonPath("$.user").doesNotExist());
    }

    @Test
    void aSessionOfADeletedAccountCannotWriteAnymore() throws Exception {
        TestClient laptop = signedIn("twodevices");
        TestClient phone = browser();
        phone.post("/api/auth/login", json("username", "twodevices", "password", "correct horse battery staple")).andExpect(status().isOk());
        laptop.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/users/me").contentType(MediaType.APPLICATION_JSON).content(json("password", "correct horse battery staple"))).andExpect(status().isNoContent());
        phone.put("/api/notes/note_9", json("title", "t", "content", "c", "pinned", false, "archived", false, "createdAt", 1, "updatedAt", 1)).andExpect(status().isUnauthorized());
        assertCount("notes", 0);
    }

    @Test
    void corsIsOffByDefault() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options("/api/notes").header("Origin", "https://evil.example").header("Access-Control-Request-Method", "GET"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
