package app.solace.common;

import java.util.regex.Pattern;

public final class Ids {
    /** Client-generated ids: short, URL-safe tokens (the frontend uses e.g. note_9f3a…). */
    public static final String PATTERN = "^[A-Za-z0-9_-]{1,64}$";
    private static final Pattern COMPILED = Pattern.compile(PATTERN);

    private Ids() {}

    public static String require(String id) {
        if (id == null || !COMPILED.matcher(id).matches()) throw ApiException.badRequest("Invalid id");
        return id;
    }
}
