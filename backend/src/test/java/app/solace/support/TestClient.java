package app.solace.support;


import jakarta.servlet.http.Cookie;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * A tiny browser stand-in: keeps cookies between requests and echoes the XSRF-TOKEN cookie in the
 * X-XSRF-TOKEN header exactly like the Solace single-page app does.
 */
public class TestClient {
    private final MockMvc mvc;
    private final Map<String, Cookie> jar = new LinkedHashMap<>();
    private boolean sendCsrf = true;
    /** MockMvc doesn't emit a session cookie, so the HTTP session object itself plays the cookie's role. */
    private MockHttpSession session;

    public TestClient(MockMvc mvc) {
        this.mvc = mvc;
    }

    public TestClient withoutCsrf() {
        this.sendCsrf = false;
        return this;
    }

    public ResultActions get(String url) throws Exception { return perform(MockMvcRequestBuilders.get(url)); }
    public ResultActions delete(String url) throws Exception { return perform(MockMvcRequestBuilders.delete(url)); }
    public ResultActions post(String url, String json) throws Exception { return perform(MockMvcRequestBuilders.post(url).contentType(MediaType.APPLICATION_JSON).content(json)); }
    public ResultActions put(String url, String json) throws Exception { return perform(MockMvcRequestBuilders.put(url).contentType(MediaType.APPLICATION_JSON).content(json)); }
    public ResultActions patch(String url, String json) throws Exception { return perform(MockMvcRequestBuilders.patch(url).contentType(MediaType.APPLICATION_JSON).content(json)); }
    public ResultActions postEmpty(String url) throws Exception { return perform(MockMvcRequestBuilders.post(url)); }

    public ResultActions upload(String url, String filename, byte[] bytes, String parentId) throws Exception {
        var req = MockMvcRequestBuilders.multipart(url).file(new MockMultipartFile("file", filename, "application/octet-stream", bytes));
        if (parentId != null) req.param("parentId", parentId);
        return perform(req);
    }

    public ResultActions perform(MockHttpServletRequestBuilder builder) throws Exception {
        jar.values().forEach(builder::cookie);
        if (session != null && !session.isInvalid()) builder.session(session);
        Cookie xsrf = jar.get("XSRF-TOKEN");
        if (sendCsrf && xsrf != null) builder.header("X-XSRF-TOKEN", xsrf.getValue());
        ResultActions result = mvc.perform(builder);
        var http = result.andReturn().getRequest().getSession(false);
        if (http instanceof MockHttpSession s && !s.isInvalid()) session = s;
        else if (session != null && session.isInvalid()) session = null;
        for (Cookie c : result.andReturn().getResponse().getCookies()) {
            if (c.getMaxAge() == 0) jar.remove(c.getName());
            else jar.put(c.getName(), c);
        }
        return result;
    }

    /** Primes the CSRF cookie the way the SPA does (any request returns it). */
    public TestClient prime() throws Exception {
        get("/api/auth/me");
        return this;
    }

    public Cookie cookie(String name) { return jar.get(name); }
    public MockHttpSession session() { return session; }
    public void useSession(MockHttpSession s) { this.session = s; }
    public Map<String, Cookie> cookies() { return jar; }

    public static String json(Object... kv) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < kv.length; i += 2) {
            if (i > 0) sb.append(',');
            sb.append('"').append(kv[i]).append("\":");
            Object v = kv[i + 1];
            if (v == null || v instanceof Number || v instanceof Boolean) sb.append(v);
            else sb.append('"').append(String.valueOf(v).replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }
}
