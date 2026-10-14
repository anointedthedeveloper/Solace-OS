package app.solace.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory sliding-window counter keyed by an arbitrary string (IP address, username…).
 * Good for a single instance; for several instances put a shared limiter (reverse proxy / Redis) in front.
 */
public class SlidingWindowRateLimiter {
    private final int maxEvents;
    private final Duration window;
    private final Clock clock;
    private final Map<String, Deque<Long>> events = new ConcurrentHashMap<>();
    private long lastSweep;

    public SlidingWindowRateLimiter(int maxEvents, Duration window, Clock clock) {
        this.maxEvents = maxEvents;
        this.window = window;
        this.clock = clock;
        this.lastSweep = clock.millis();
    }

    /** Records one event and returns true while the key is within its allowance. */
    public boolean tryAcquire(String key) {
        long now = clock.millis();
        sweep(now);
        Deque<Long> q = events.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            evict(q, now);
            if (q.size() >= maxEvents) return false;
            q.addLast(now);
            return true;
        }
    }

    /** True if the key has already used up its allowance (without recording another event). */
    public boolean isBlocked(String key) {
        Deque<Long> q = events.get(key);
        if (q == null) return false;
        synchronized (q) {
            evict(q, clock.millis());
            return q.size() >= maxEvents;
        }
    }

    /** Record an event unconditionally (e.g. a failed login). */
    public void record(String key) {
        long now = clock.millis();
        sweep(now);
        Deque<Long> q = events.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            evict(q, now);
            q.addLast(now);
        }
    }

    public void reset(String key) {
        events.remove(key);
    }

    /** Seconds until the oldest event leaves the window. */
    public long retryAfterSeconds(String key) {
        Deque<Long> q = events.get(key);
        if (q == null) return 1;
        synchronized (q) {
            Long oldest = q.peekFirst();
            if (oldest == null) return 1;
            return Math.max(1, (oldest + window.toMillis() - clock.millis() + 999) / 1000);
        }
    }

    private void evict(Deque<Long> q, long now) {
        long cutoff = now - window.toMillis();
        while (!q.isEmpty() && q.peekFirst() <= cutoff) q.pollFirst();
    }

    /** Periodically drop idle keys so memory stays bounded. */
    private void sweep(long now) {
        if (now - lastSweep < window.toMillis()) return;
        lastSweep = now;
        events.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                evict(e.getValue(), now);
                return e.getValue().isEmpty();
            }
        });
    }
}
