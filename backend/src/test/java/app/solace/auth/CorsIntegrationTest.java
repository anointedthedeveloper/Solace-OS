package app.solace.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.solace.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = "solace.cors-allowed-origins=https://app.example.com")
class CorsIntegrationTest extends IntegrationTest {
    @Test
    void onlyTheConfiguredOriginMayCallTheApiWithCredentials() throws Exception {
        mvc.perform(options("/api/notes").header("Origin", "https://app.example.com").header("Access-Control-Request-Method", "PUT").header("Access-Control-Request-Headers", "content-type,x-xsrf-token"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://app.example.com"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void otherOriginsAreRefused() throws Exception {
        mvc.perform(options("/api/notes").header("Origin", "https://evil.example").header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void headersOutsideTheAllowListAreRefused() throws Exception {
        mvc.perform(options("/api/notes").header("Origin", "https://app.example.com").header("Access-Control-Request-Method", "GET").header("Access-Control-Request-Headers", "x-evil"))
                .andExpect(status().isForbidden());
    }
}
