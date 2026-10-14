package app.solace.common;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

public final class Paging {
    public static final int MAX_SIZE = 200;

    private Paging() {}

    /** Clamp client-supplied paging so a request can never ask for an unbounded result set. */
    public static Pageable of(int page, int size, Sort sort) {
        return PageRequest.of(Math.max(0, page), Math.min(MAX_SIZE, Math.max(1, size)), sort);
    }
}
