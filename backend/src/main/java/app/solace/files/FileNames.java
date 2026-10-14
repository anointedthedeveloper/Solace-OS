package app.solace.files;

import app.solace.common.ApiException;
import java.text.Normalizer;
import java.util.regex.Pattern;

final class FileNames {
    private static final Pattern FORBIDDEN = Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");

    private FileNames() {}

    /** Normalise and validate a single path segment. Path separators and traversal are rejected outright. */
    static String clean(String raw) {
        if (raw == null) throw ApiException.badRequest("Name is required");
        String n = Normalizer.normalize(raw.trim(), Normalizer.Form.NFC);
        if (n.isEmpty()) throw ApiException.badRequest("Name cannot be empty");
        if (n.length() > 120) throw ApiException.badRequest("Name must be at most 120 characters");
        if (n.equals(".") || n.equals("..")) throw ApiException.badRequest("That name is not allowed");
        if (FORBIDDEN.matcher(n).find()) throw ApiException.badRequest("Names cannot contain \\ / : * ? \" < > | or control characters");
        return n;
    }

    /** "report.txt" → "report (2).txt" */
    static String withSuffix(String name, int n) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) + " (" + n + ")" + name.substring(dot) : name + " (" + n + ")";
    }
}
