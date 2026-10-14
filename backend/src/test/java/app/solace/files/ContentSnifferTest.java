package app.solace.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.solace.common.ApiException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ContentSnifferTest {
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0};
    private static final byte[] PDF = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] ZIP = {'P', 'K', 3, 4, 0, 0};

    private static byte[] text(String s) { return s.getBytes(StandardCharsets.UTF_8); }

    @Test
    void acceptsValidFilesAndChoosesTheMimeTypeItself() {
        assertThat(ContentSniffer.verify("notes.txt", text("hello\nworld")).mimeType()).isEqualTo("text/plain");
        assertThat(ContentSniffer.verify("README.MD", text("# hi")).mimeType()).isEqualTo("text/markdown");
        assertThat(ContentSniffer.verify("data.json", text("{\"a\":1}")).mimeType()).isEqualTo("application/json");
        assertThat(ContentSniffer.verify("pic.PNG", PNG).mimeType()).isEqualTo("image/png");
        assertThat(ContentSniffer.verify("pic.jpeg", JPEG).mimeType()).isEqualTo("image/jpeg");
        assertThat(ContentSniffer.verify("doc.pdf", PDF).mimeType()).isEqualTo("application/pdf");
        assertThat(ContentSniffer.verify("a.docx", ZIP).mimeType()).contains("wordprocessingml");
        assertThat(ContentSniffer.verify("empty.txt", new byte[0]).mimeType()).isEqualTo("text/plain");
        assertThat(ContentSniffer.verify("unicode.txt", text("héllo wörld ✓")).mimeType()).isEqualTo("text/plain");
    }

    @Test
    void rejectsContentThatDoesNotMatchTheExtension() {
        assertThatThrownBy(() -> ContentSniffer.verify("fake.png", text("just text"))).isInstanceOf(ApiException.class).hasMessageContaining("do not match");
        assertThatThrownBy(() -> ContentSniffer.verify("fake.pdf", PNG)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> ContentSniffer.verify("fake.jpg", PNG)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> ContentSniffer.verify("fake.zip", text("not a zip"))).isInstanceOf(ApiException.class);
    }

    @Test
    void rejectsBinaryMaskedAsText() {
        assertThatThrownBy(() -> ContentSniffer.verify("a.txt", new byte[] {'a', 0, 'b'})).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> ContentSniffer.verify("a.txt", new byte[] {(byte) 0xC3, (byte) 0x28})).isInstanceOf(ApiException.class); // invalid UTF-8
        assertThatThrownBy(() -> ContentSniffer.verify("a.csv", new byte[] {'a', 0x07, 'b'})).isInstanceOf(ApiException.class); // BEL
    }

    @Test
    void rejectsExecutablesEvenWithInnocentNames() {
        assertThatThrownBy(() -> ContentSniffer.verify("setup.txt", new byte[] {'M', 'Z', (byte) 0x90, 0})).hasMessageContaining("Executable");
        assertThatThrownBy(() -> ContentSniffer.verify("run.txt", new byte[] {0x7F, 'E', 'L', 'F'})).hasMessageContaining("Executable");
        assertThatThrownBy(() -> ContentSniffer.verify("script.txt", text("#!/bin/sh\nrm -rf /"))).hasMessageContaining("Executable");
        assertThatThrownBy(() -> ContentSniffer.verify("x.zip", new byte[] {(byte) 0xCA, (byte) 0xFE, (byte) 0xBA, (byte) 0xBE})).isInstanceOf(ApiException.class);
    }

    @Test
    void rejectsAnythingOutsideTheAllowList() {
        for (String name : new String[] {"a.exe", "a.sh", "a.bat", "a.js", "a.html", "a.svg", "a.php", "a.dll", "a.ps1", "noextension", "trailingdot."}) {
            assertThatThrownBy(() -> ContentSniffer.verify(name, text("x")))
                    .as(name)
                    .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
        }
    }

    @Test
    void htmlInsideAnAllowedTextFileIsJustText() {
        // Stored as text/plain and always served as an attachment with nosniff, so it can never execute.
        assertThat(ContentSniffer.verify("page.txt", text("<script>alert(1)</script>")).mimeType()).isEqualTo("text/plain");
    }

    @Test
    void extensionParsing() {
        assertThat(ContentSniffer.extensionOf("a.b.TXT")).isEqualTo("txt");
        assertThat(ContentSniffer.extensionOf("none")).isEmpty();
        assertThat(ContentSniffer.extensionOf("dot.")).isEmpty();
    }
}
