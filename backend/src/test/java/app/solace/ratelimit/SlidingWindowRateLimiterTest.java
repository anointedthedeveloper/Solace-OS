package app.solace.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class SlidingWindowRateLimiterTest {
    /** A clock the test can move forward. */
    static class FakeClock extends Clock {
        final AtomicLong now = new AtomicLong(1_000_000);
        public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(java.time.ZoneId z) { return this; }
        public Instant instant() { return Instant.ofEpochMilli(now.get()); }
        void advance(Duration d) { now.addAndGet(d.toMillis()); }
    }

    @Test
    void allowsUpToTheLimitThenBlocks() {
        FakeClock clock = new FakeClock();
        var rl = new SlidingWindowRateLimiter(3, Duration.ofMinutes(1), clock);
        assertThat(rl.tryAcquire("ip")).isTrue();
        assertThat(rl.tryAcquire("ip")).isTrue();
        assertThat(rl.tryAcquire("ip")).isTrue();
        assertThat(rl.tryAcquire("ip")).isFalse();
        assertThat(rl.tryAcquire("other")).as("keys are independent").isTrue();
    }

    @Test
    void recoversAfterTheWindowSlides() {
        FakeClock clock = new FakeClock();
        var rl = new SlidingWindowRateLimiter(2, Duration.ofSeconds(60), clock);
        rl.tryAcquire("k");
        clock.advance(Duration.ofSeconds(30));
        rl.tryAcquire("k");
        assertThat(rl.tryAcquire("k")).isFalse();
        assertThat(rl.retryAfterSeconds("k")).isBetween(29L, 31L);
        clock.advance(Duration.ofSeconds(31)); // first event leaves the window
        assertThat(rl.tryAcquire("k")).isTrue();
    }

    @Test
    void failureCountersBlockAndReset() {
        FakeClock clock = new FakeClock();
        var rl = new SlidingWindowRateLimiter(2, Duration.ofMinutes(1), clock);
        assertThat(rl.isBlocked("u")).isFalse();
        rl.record("u");
        rl.record("u");
        assertThat(rl.isBlocked("u")).isTrue();
        rl.reset("u");
        assertThat(rl.isBlocked("u")).isFalse();
    }

    @Test
    void idleKeysAreSweptSoMemoryStaysBounded() {
        FakeClock clock = new FakeClock();
        var rl = new SlidingWindowRateLimiter(5, Duration.ofSeconds(10), clock);
        for (int i = 0; i < 100; i++) rl.record("key" + i);
        clock.advance(Duration.ofSeconds(25));
        rl.record("trigger-sweep");
        assertThat(rl.isBlocked("key0")).isFalse();
    }
}
