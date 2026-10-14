package app.solace.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed view of the {@code solace.*} configuration. */
@ConfigurationProperties(prefix = "solace")
public class AppProperties {
    private String corsAllowedOrigins = "";
    private boolean cookieSecure = true;
    private int bcryptStrength = 12;
    private final Files files = new Files();
    private final RateLimit rateLimit = new RateLimit();

    public List<String> corsOrigins() {
        List<String> out = new ArrayList<>();
        for (String o : corsAllowedOrigins.split(",")) {
            if (!o.isBlank()) out.add(o.trim());
        }
        return out;
    }

    public String getCorsAllowedOrigins() { return corsAllowedOrigins; }
    public void setCorsAllowedOrigins(String v) { this.corsAllowedOrigins = v == null ? "" : v; }
    public boolean isCookieSecure() { return cookieSecure; }
    public void setCookieSecure(boolean v) { this.cookieSecure = v; }
    public int getBcryptStrength() { return bcryptStrength; }
    public void setBcryptStrength(int v) { this.bcryptStrength = v; }
    public Files getFiles() { return files; }
    public RateLimit getRateLimit() { return rateLimit; }

    public static class Files {
        private long maxFileBytes = 10L * 1024 * 1024;
        private long quotaBytes = 100L * 1024 * 1024;
        public long getMaxFileBytes() { return maxFileBytes; }
        public void setMaxFileBytes(long v) { this.maxFileBytes = v; }
        public long getQuotaBytes() { return quotaBytes; }
        public void setQuotaBytes(long v) { this.quotaBytes = v; }
    }

    public static class RateLimit {
        private int loginPerIp = 20;
        private int loginFailuresPerUser = 5;
        private int registerPerIp = 5;
        private int windowSeconds = 900;
        public int getLoginPerIp() { return loginPerIp; }
        public void setLoginPerIp(int v) { this.loginPerIp = v; }
        public int getLoginFailuresPerUser() { return loginFailuresPerUser; }
        public void setLoginFailuresPerUser(int v) { this.loginFailuresPerUser = v; }
        public int getRegisterPerIp() { return registerPerIp; }
        public void setRegisterPerIp(int v) { this.registerPerIp = v; }
        public int getWindowSeconds() { return windowSeconds; }
        public void setWindowSeconds(int v) { this.windowSeconds = v; }
    }
}
