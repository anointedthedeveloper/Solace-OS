package app.solace.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/** The one error shape every endpoint returns. Never contains stack traces or internal details. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(Instant timestamp, int status, String error, String message, String path, List<FieldIssue> fieldErrors) {

    public record FieldIssue(String field, String message) {}

    public static ApiError of(int status, String error, String message, String path, List<FieldIssue> fields) {
        return new ApiError(Instant.now(), status, error, message, path, fields);
    }
}
