package app.solace.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.solace.common.ApiException;
import org.junit.jupiter.api.Test;

class FileNamesTest {
    @Test
    void trimsAndNormalises() {
        assertThat(FileNames.clean("  report.txt  ")).isEqualTo("report.txt");
        assertThat(FileNames.clean("é.txt")).isEqualTo("é.txt"); // NFC
    }

    @Test
    void rejectsTraversalSeparatorsAndControlCharacters() {
        for (String bad : new String[] {"", "   ", ".", "..", "../etc/passwd", "a/b", "a\\b", "a:b", "a*b", "a?b", "a\"b", "a<b", "a>b", "a|b", "a\u0000b", "a\nb", "x".repeat(121)}) {
            assertThatThrownBy(() -> FileNames.clean(bad)).as(bad).isInstanceOf(ApiException.class);
        }
        assertThatThrownBy(() -> FileNames.clean(null)).isInstanceOf(ApiException.class);
    }

    @Test
    void buildsNumberedAlternatives() {
        assertThat(FileNames.withSuffix("report.txt", 2)).isEqualTo("report (2).txt");
        assertThat(FileNames.withSuffix("Makefile", 3)).isEqualTo("Makefile (3)");
        assertThat(FileNames.withSuffix(".hidden", 2)).isEqualTo(".hidden (2)");
    }
}
