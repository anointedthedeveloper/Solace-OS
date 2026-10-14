package app.solace.common;

import org.springframework.http.HttpStatus;

/** Base class for expected, client-facing failures. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() { return status; }

    public static ApiException notFound(String what) { return new ApiException(HttpStatus.NOT_FOUND, what + " not found"); }
    public static ApiException conflict(String msg) { return new ApiException(HttpStatus.CONFLICT, msg); }
    public static ApiException badRequest(String msg) { return new ApiException(HttpStatus.BAD_REQUEST, msg); }
    public static ApiException unauthorized(String msg) { return new ApiException(HttpStatus.UNAUTHORIZED, msg); }
    public static ApiException payloadTooLarge(String msg) { return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, msg); }
    public static ApiException unprocessable(String msg) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, msg); }
    public static ApiException insufficientStorage(String msg) { return new ApiException(HttpStatus.valueOf(507), msg); }
}
