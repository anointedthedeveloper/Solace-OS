package app.solace.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import app.solace.common.ApiException;
import app.solace.config.AppProperties;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FileServiceTest {
    @Mock FileNodeRepository nodes;
    @Mock FileContentRepository contents;
    AppProperties props = new AppProperties();
    FileService service;
    final UUID owner = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        props.getFiles().setMaxFileBytes(100);
        props.getFiles().setQuotaBytes(150);
        service = new FileService(nodes, contents, props, Clock.systemUTC());
    }

    private static HttpStatus statusOf(Throwable t) { return ((ApiException) t).status(); }

    @Test
    void oversizedUploadsAreRejectedBeforeAnythingIsStored() {
        assertThatThrownBy(() -> service.upload(owner, null, "big.txt", "x".repeat(101).getBytes())).satisfies(t -> assertThat(statusOf(t)).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE));
        verifyNoInteractions(contents);
        verify(nodes, never()).save(any());
    }

    @Test
    void theQuotaCountsWhatTheUserAlreadyStores() {
        when(nodes.totalBytes(owner)).thenReturn(100L);
        assertThatThrownBy(() -> service.upload(owner, null, "a.txt", "x".repeat(60).getBytes())).satisfies(t -> assertThat(statusOf(t).value()).isEqualTo(507));
        verify(nodes, never()).save(any());
        verifyNoInteractions(contents);
    }

    @Test
    void contentIsVerifiedBeforeSaving() {
        assertThatThrownBy(() -> service.upload(owner, null, "x.png", "not a png".getBytes())).satisfies(t -> assertThat(statusOf(t)).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
        verify(nodes, never()).save(any());
    }

    @Test
    void successfulUploadSavesMetadataAndBytes() {
        when(nodes.totalBytes(owner)).thenReturn(0L);
        when(nodes.nameTakenInRoot(any(), any(), any())).thenReturn(false);
        when(nodes.save(any(FileNode.class))).thenAnswer(i -> i.getArgument(0));
        var res = service.upload(owner, null, "ok.txt", "hello".getBytes());
        assertThat(res.name()).isEqualTo("ok.txt");
        assertThat(res.size()).isEqualTo(5);
        verify(contents).save(any(FileContent.class));
    }

    @Test
    void anotherUsersFileLooksLikeItDoesNotExist() {
        UUID id = UUID.randomUUID();
        when(nodes.findOwned(owner, id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.get(owner, id)).satisfies(t -> assertThat(statusOf(t)).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> service.download(owner, id)).satisfies(t -> assertThat(statusOf(t)).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> service.trash(owner, id)).satisfies(t -> assertThat(statusOf(t)).isEqualTo(HttpStatus.NOT_FOUND));
        verifyNoInteractions(contents);
    }

    @Test
    void usageReportsConfiguredLimits() {
        when(nodes.totalBytes(owner)).thenReturn(42L);
        var u = service.usage(owner);
        assertThat(u.usedBytes()).isEqualTo(42);
        assertThat(u.quotaBytes()).isEqualTo(150);
        assertThat(u.maxFileBytes()).isEqualTo(100);
    }
}
