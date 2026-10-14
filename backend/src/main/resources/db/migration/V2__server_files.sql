-- Server-managed files ("Solace Cloud"): a per-user tree of folders and files.
create table file_nodes (
    id         uuid         primary key,
    owner_id   uuid         not null references users (id) on delete cascade,
    parent_id  uuid         references file_nodes (id) on delete cascade,
    name       varchar(120) not null,
    kind       varchar(8)   not null,
    mime_type  varchar(100) not null,
    size_bytes bigint       not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    trashed_at timestamp with time zone
);
create index ix_file_nodes_owner_parent on file_nodes (owner_id, parent_id);
create index ix_file_nodes_owner_trashed on file_nodes (owner_id, trashed_at);

-- Bytes live in their own table so listing a folder never loads file content.
create table file_contents (
    file_id uuid  primary key references file_nodes (id) on delete cascade,
    content bytea not null
);
