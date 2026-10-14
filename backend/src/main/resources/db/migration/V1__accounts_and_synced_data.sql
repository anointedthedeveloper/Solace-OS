-- Accounts and synced app data. Portable SQL (PostgreSQL in production, H2 in PostgreSQL mode in tests).

create table users (
    id             uuid         primary key,
    username       varchar(32)  not null,
    username_lower varchar(32)  not null,
    display_name   varchar(40)  not null,
    password_hash  varchar(100) not null,
    created_at     timestamp with time zone not null,
    updated_at     timestamp with time zone not null
);
create unique index ux_users_username_lower on users (username_lower);

create table preferences (
    user_id    uuid primary key references users (id) on delete cascade,
    data       text not null,
    updated_at timestamp with time zone not null
);

-- Client-generated ids are scoped per user: (user_id, id) is the key, so one user can never
-- address or collide with another user's rows.
create table notes (
    user_id    uuid         not null references users (id) on delete cascade,
    id         varchar(64)  not null,
    title      varchar(500) not null,
    content    text         not null,
    pinned     boolean      not null,
    archived   boolean      not null,
    created_at bigint       not null,
    updated_at bigint       not null,
    primary key (user_id, id)
);
create index ix_notes_user_updated on notes (user_id, updated_at);

create table tasks (
    user_id      uuid          not null references users (id) on delete cascade,
    id           varchar(64)   not null,
    title        varchar(200)  not null,
    details      varchar(2000) not null,
    due          date,
    priority     varchar(8)    not null,
    done         boolean       not null,
    created_at   bigint        not null,
    completed_at bigint,
    updated_at   bigint        not null,
    primary key (user_id, id)
);
create index ix_tasks_user_updated on tasks (user_id, updated_at);

create table events (
    user_id     uuid          not null references users (id) on delete cascade,
    id          varchar(64)   not null,
    title       varchar(200)  not null,
    start_at    bigint        not null,
    end_at      bigint        not null,
    all_day     boolean       not null,
    location    varchar(200)  not null,
    description varchar(2000) not null,
    updated_at  bigint        not null,
    primary key (user_id, id)
);
create index ix_events_user_start on events (user_id, start_at);
