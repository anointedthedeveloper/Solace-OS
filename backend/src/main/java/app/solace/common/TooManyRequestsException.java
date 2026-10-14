package app.solace.common;

import org.springframework.http.HttpStatus;

public class TooManyRequestsException extends ApiException {
    private final long retryAfterSeconds;

    public TooManyRequestsException(long retryAfterSeconds) {
        super(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please try again later.");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long retryAfterSeconds() { return retryAfterSeconds; }
}
