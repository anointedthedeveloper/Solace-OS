package app.solace.files;

import app.solace.common.ApiException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;

/**
 * Validates uploads by *extension allow-list and actual content*, never by the client-declared
 * Content-Type. The result is a safe MIME type chosen by us; files are always served as attachments.
 */
public final class ContentSniffer {
    private ContentSniffer() {}

    public record Verified(String mimeType) {}

    private enum Family { TEXT, PNG, JPEG, GIF, WEBP, PDF, ZIP }

    private record Rule(Family family, String mime) {}

    private static final Map<String, Rule> RULES = Map.ofEntries(
            Map.entry("txt", new Rule(Family.TEXT, "text/plain")),
            Map.entry("log", new Rule(Family.TEXT, "text/plain")),
            Map.entry("md", new Rule(Family.TEXT, "text/markdown")),
            Map.entry("csv", new Rule(Family.TEXT, "text/csv")),
            Map.entry("json", new Rule(Family.TEXT, "application/json")),
            Map.entry("png", new Rule(Family.PNG, "image/png")),
            Map.entry("jpg", new Rule(Family.JPEG, "image/jpeg")),
            Map.entry("jpeg", new Rule(Family.JPEG, "image/jpeg")),
            Map.entry("gif", new Rule(Family.GIF, "image/gif")),
            Map.entry("webp", new Rule(Family.WEBP, "image/webp")),
            Map.entry("pdf", new Rule(Family.PDF, "application/pdf")),
            Map.entry("zip", new Rule(Family.ZIP, "application/zip")),
            Map.entry("docx", new Rule(Family.ZIP, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
            Map.entry("xlsx", new Rule(Family.ZIP, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
            Map.entry("pptx", new Rule(Family.ZIP, "application/vnd.openxmlformats-officedocument.presentationml.presentation")),
            Map.entry("odt", new Rule(Family.ZIP, "application/vnd.oasis.opendocument.text")),
            Map.entry("ods", new Rule(Family.ZIP, "application/vnd.oasis.opendocument.spreadsheet")));

    public static String extensionOf(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot < 0 || dot == filename.length() - 1 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    public static Verified verify(String filename, byte[] data) {
        Rule rule = RULES.get(extensionOf(filename));
        if (rule == null) throw ApiException.unprocessable("That file type is not supported");
        if (looksExecutable(data)) throw ApiException.unprocessable("Executable content is not allowed");
        boolean ok = switch (rule.family()) {
            case TEXT -> isPlainText(data);
            case PNG -> startsWith(data, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A);
            case JPEG -> startsWith(data, 0xFF, 0xD8, 0xFF);
            case GIF -> startsWith(data, 'G', 'I', 'F', '8');
            case WEBP -> data.length >= 12 && startsWith(data, 'R', 'I', 'F', 'F') && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P';
            case PDF -> startsWith(data, '%', 'P', 'D', 'F', '-');
            case ZIP -> startsWith(data, 'P', 'K', 3, 4) || (data.length == 22 && startsWith(data, 'P', 'K', 5, 6)); // 22 bytes = empty archive
        };
        if (!ok) throw ApiException.unprocessable("The file's contents do not match its type");
        return new Verified(rule.mime());
    }

    private static boolean startsWith(byte[] d, int... sig) {
        if (d.length < sig.length) return false;
        for (int i = 0; i < sig.length; i++) if ((d[i] & 0xFF) != sig[i]) return false;
        return true;
    }

    private static boolean looksExecutable(byte[] d) {
        return startsWith(d, 'M', 'Z') // Windows PE
                || startsWith(d, 0x7F, 'E', 'L', 'F')
                || startsWith(d, 0xCF, 0xFA, 0xED, 0xFE) || startsWith(d, 0xCE, 0xFA, 0xED, 0xFE) || startsWith(d, 0xCA, 0xFE, 0xBA, 0xBE)
                || startsWith(d, '#', '!'); // shebang scripts
    }

    /** Valid UTF-8 with no NUL / stray control characters. (Empty files are allowed.) */
    static boolean isPlainText(byte[] d) {
        try {
            String s = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(d)).toString();
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                if (c == 0 || (c < 0x20 && c != '\n' && c != '\r' && c != '\t' && c != '\f')) return false;
            }
            return true;
        } catch (CharacterCodingException e) {
            return false;
        }
    }
}
