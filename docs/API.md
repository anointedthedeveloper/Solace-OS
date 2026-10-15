# Solace OS REST API

Base path `/api`. JSON in, JSON out (files excepted). Interactive docs (OpenAPI/Swagger UI) are available at
`/swagger-ui.html` when the backend runs with `SOLACE_API_DOCS=true` (or the `dev` profile).

## Conventions

* **Auth**: session cookie `SOLACE_SESSION` (HttpOnly, SameSite=Lax, `Secure` in production). No tokens in JavaScript.
* **CSRF**: every `POST/PUT/PATCH/DELETE` must send the value of the `XSRF-TOKEN` cookie in the `X-XSRF-TOKEN` header. Any `GET` (e.g. `/api/auth/session`) sets the cookie. Missing/invalid → `403`.
* **Errors** always look like `{ "timestamp", "status", "error", "message", "path", "fieldErrors"? }`. `fieldErrors` is `[{field, message}]` on `400` validation failures.
* **Status codes**: `400` validation/malformed · `401` not signed in · `403` CSRF · `404` not found *or not yours* · `409` conflict · `413` too large · `422` unsupported/mismatched file content · `429` rate limited (`Retry-After`) · `507` storage quota.
* **Ownership**: every resource is scoped to the signed-in user. Another user's ids behave exactly like non-existent ones (`404`).
* **Paging**: list endpoints accept `page` (0-based) and `size` (1–200) and return `{items, page, size, totalElements, totalPages}`.

## Auth & account

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/session` | Always `200`: `{authenticated, user?}`. Primes the CSRF cookie. |
| POST | `/auth/register` | `{username, password, displayName?}` → `201` + user, signs in. Username 3–32 `[A-Za-z0-9._-]`; password 10–72 chars. Rate limited. |
| POST | `/auth/login` | `{username, password}` → user. Same `401` for unknown user and wrong password. Rate limited per IP and per username. |
| POST | `/auth/logout` | `204`; the server session is invalidated. |
| PATCH | `/users/me` | `{displayName}` |
| DELETE | `/users/me` | `{password}` → `204`; deletes the account and **all** its data. |

## Synced data (client-generated ids matching `^[A-Za-z0-9_-]{1,64}$`)

`GET /notes`, `GET /notes/{id}`, `PUT /notes/{id}` (create-or-update; `201` created / `200` updated), `DELETE /notes/{id}` — same shape for `/tasks` and `/events`.
A `PUT` whose `updatedAt` is older than the stored version returns `409`.

* Note: `{title≤500, content≤200000, pinned, archived, createdAt, updatedAt}`
* Task: `{title≤200, details≤2000, due?(yyyy-mm-dd), priority(low|medium|high), done, createdAt, completedAt?, updatedAt}`
* Event: `{title≤200, start, end(≥start), allDay, location≤200, description≤2000, updatedAt}` (epoch ms)

`GET /preferences` (`204` if none) · `PUT /preferences` — an opaque JSON object ≤ 16 KiB.

## Files (server-managed "Cloud")

| Method | Path | Notes |
|---|---|---|
| GET | `/files?parentId=` | Active children (omit `parentId` for the root); folders first. |
| GET | `/files/trash` | Top-level trashed items. |
| DELETE | `/files/trash` | Empty the trash → `{deleted}`. |
| GET | `/files/usage` | `{usedBytes, quotaBytes, maxFileBytes}` |
| GET | `/files/{id}` | Metadata. |
| GET | `/files/{id}/content` | Bytes. Always `Content-Disposition: attachment`, `nosniff`, server-chosen type. |
| POST | `/files/folders` | `{parentId?, name}` → `201`. Duplicate name → `409`. |
| POST | `/files` | `multipart/form-data`: `file`, optional `parentId` query param → `201`. Duplicate names are auto-numbered. |
| PATCH | `/files/{id}` | `{name}` to rename (extension can't change) and/or `{move:true, parentId}` (`null` = root; cycles → `409`). |
| DELETE | `/files/{id}` | Move to trash. `?permanent=true` deletes for good (only from the trash). |
| POST | `/files/{id}/restore` | Restore (renames on conflict; falls back to the root). |

Allowed uploads: `txt md csv json log png jpg jpeg gif webp pdf zip docx xlsx pptx odt ods`. The extension must match the *actual bytes* (magic numbers / valid UTF-8 text); executables are refused whatever they are called.
