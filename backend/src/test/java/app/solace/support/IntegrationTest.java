package app.solace.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Full application context (security chain, JPA, Flyway on H2 in PostgreSQL mode) driven through MockMvc. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTest {
    public static final String PASSWORD = "correct horse battery staple";

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        jdbc.update("delete from users"); // everything else cascades
    }

    protected TestClient browser() throws Exception {
        return new TestClient(mvc).prime();
    }

    /** Registers a fresh account and returns a browser that is signed in as it. */
    protected TestClient signedIn(String username) throws Exception {
        TestClient b = browser();
        b.post("/api/auth/register", TestClient.json("username", username, "password", PASSWORD, "displayName", username)).andExpect(status().isCreated());
        return b;
    }

    protected UUID userId(String username) {
        return jdbc.queryForObject("select id from users where username_lower = ?", UUID.class, username.toLowerCase());
    }

    protected long count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Long.class);
    }

    protected void assertCount(String table, long expected) {
        assertThat(count(table)).isEqualTo(expected);
    }
}
