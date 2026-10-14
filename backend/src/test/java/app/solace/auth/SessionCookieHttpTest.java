package app.solace.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/** Talks to a real embedded Tomcat so we can assert on the actual Set-Cookie headers browsers receive. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class SessionCookieHttpTest {
    @LocalServerPort int port;

    @Test
    void sessionAndCsrfCookiesHaveSafeAttributes() throws Exception {
        HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager()).build();
        String base = "http://localhost:" + port;
        HttpResponse<String> first = client.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/me")).build(), HttpResponse.BodyHandlers.ofString());
        List<String> cookies = first.headers().allValues("Set-Cookie");
        String xsrf = cookies.stream().filter(c -> c.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow();
        assertThat(xsrf).contains("SameSite=Lax").doesNotContain("HttpOnly"); // script-readable by design

        String token = xsrf.substring("XSRF-TOKEN=".length(), xsrf.indexOf(';'));
        HttpResponse<String> reg = client.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/register"))
                .header("Content-Type", "application/json").header("X-XSRF-TOKEN", token)
                .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"httpuser\",\"password\":\"a very long passphrase\"}")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(reg.statusCode()).isEqualTo(201);
        String session = reg.headers().allValues("Set-Cookie").stream().filter(c -> c.startsWith("SOLACE_SESSION=")).findFirst().orElseThrow();
        assertThat(session).contains("HttpOnly").contains("SameSite=Lax").contains("Path=/");
        assertThat(session).as("Secure is off only in the test profile; production default is on").doesNotContain("Secure");

        HttpResponse<String> me = client.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/me")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(me.statusCode()).isEqualTo(200);
    }
}
