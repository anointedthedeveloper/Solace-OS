package app.solace.common;

import app.solace.common.ApiError.FieldIssue;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Maps every failure to the consistent {@link ApiError} body with the right HTTP status. */
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static ResponseEntity<ApiError> body(HttpStatus status, String message, HttpServletRequest req, List<FieldIssue> fields) {
        return ResponseEntity.status(status).body(ApiError.of(status.value(), status.getReasonPhrase(), message, req.getRequestURI(), fields));
    }

    @ExceptionHandler(TooManyRequestsException.class)
    ResponseEntity<ApiError> tooMany(TooManyRequestsException e, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.retryAfterSeconds()))
                .body(ApiError.of(429, "Too Many Requests", e.getMessage(), req.getRequestURI(), null));
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> api(ApiException e, HttpServletRequest req) {
        return body(e.status(), e.getMessage(), req, null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalid(MethodArgumentNotValidException e, HttpServletRequest req) {
        List<FieldIssue> issues = e.getBindingResult().getFieldErrors().stream().map(f -> new FieldIssue(f.getField(), f.getDefaultMessage())).toList();
        return body(HttpStatus.BAD_REQUEST, "Validation failed", req, issues);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> constraint(ConstraintViolationException e, HttpServletRequest req) {
        List<FieldIssue> issues = e.getConstraintViolations().stream().map(v -> new FieldIssue(v.getPropertyPath().toString(), v.getMessage())).toList();
        return body(HttpStatus.BAD_REQUEST, "Validation failed", req, issues);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class, MissingServletRequestPartException.class})
    ResponseEntity<ApiError> malformed(Exception e, HttpServletRequest req) {
        return body(HttpStatus.BAD_REQUEST, "The request could not be understood", req, null);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> tooLarge(MaxUploadSizeExceededException e, HttpServletRequest req) {
        return body(HttpStatus.PAYLOAD_TOO_LARGE, "That upload is too large", req, null);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> method(HttpRequestMethodNotSupportedException e, HttpServletRequest req) {
        return body(HttpStatus.METHOD_NOT_ALLOWED, "Method not allowed", req, null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> noResource(NoResourceFoundException e, HttpServletRequest req) {
        return body(HttpStatus.NOT_FOUND, "Not found", req, null);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> integrity(DataIntegrityViolationException e, HttpServletRequest req) {
        log.warn("Data integrity violation on {} {}", req.getMethod(), req.getRequestURI());
        return body(HttpStatus.CONFLICT, "The request conflicts with existing data", req, null);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception e, HttpServletRequest req) {
        // Log the cause (never request bodies, passwords or tokens) but tell the client nothing internal.
        log.error("Unhandled error on {} {}", req.getMethod(), req.getRequestURI(), e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong on our side", req, null);
    }
}
