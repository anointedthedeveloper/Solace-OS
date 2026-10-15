# Solace OS

> **Everything in its place.**

A browser-based desktop environment: real draggable/resizable windows, a dock, launcher, widgets and nine built-in apps, with an optional Spring Boot backend for accounts, sync and server-managed files.

* **Guest mode (default):** everything is stored in your browser. No account, nothing leaves the device.
* **With the backend:** sign in to sync notes, tasks, calendar events and appearance settings across devices, and to use cloud files.

```
frontend/   React 19 · TypeScript (strict) · Vite · Tailwind v4 · Zustand · Lucide
backend/    Java 21 · Spring Boot 3.5 · Spring Security · JPA · Flyway · PostgreSQL
deploy/     nginx config (single-origin serving + /api proxy)
docs/       API reference and architecture notes
```

## Features

| App | What it does |
|---|---|
| **Files** | *Solace Files* (virtual file system in IndexedDB: folders, upload/download, copy/cut/paste, drag & drop, trash, search, list/grid, sort/filter); **This computer** (read-only browsing of a folder you pick, Chromium only); **Cloud** (server files, when signed in) |
| **Text Editor** | Tabs, dirty markers, autosave, find/replace, counts, unsaved-changes protection, open/save to your computer |
| **Notes** | Search, pin, archive, autosave |
| **Calendar** | Month + agenda views, events with times, validation, deletion confirmation (local; no external sync) |
| **Tasks** | Due dates, priorities, filters, search, completed handling |
| **Calculator** | Real parser (never `eval`), precedence, keyboard, history |
| **Terminal** | A *simulated* Solace command environment (`help`, `open`, `theme`, `apps`…). It can't run programs or shell commands |
| **Web** | Start page for sites you choose; they open in a new tab (`noopener`) and are clearly marked external |
| **Settings** | Theme, accents, wallpapers (incl. upload), density, motion, corners, desktop icons, dock, widgets, notifications, shortcuts, workspace, privacy, storage + export/import, account, reset |

Desktop: first-run welcome, wallpapers, draggable icons, floating or bar dock (bottom/left/right), tray, clock popover, notifications, quick settings, context menus, snap-to-edges, six widgets (clock, calendar, notes, tasks, timer, quick launch), workspace restoration after refresh.

### Keyboard shortcuts (rebindable in Settings → Keyboard shortcuts)

They use **Alt** so they never collide with browser commands (`Ctrl+W`, `Ctrl+T`… are refused as bindings).

| Action | Default |
|---|---|
| Launcher | `Alt + Space` |
| Close / minimize / maximize window | `Alt + W` / `Alt + M` / `Alt + Enter` |
| Next / previous window | `Alt + .` / `Alt + ,` |
| Show desktop | `Alt + D` |
| Notifications / quick settings | `Alt + N` / `Alt + Q` |
| Terminal | `Alt + T` |

## Prerequisites

* Node.js 20+ (developed on 22) and npm
* Java 21 and Maven 3.9+ (backend only)
* PostgreSQL 14+ (backend only; 16 tested) — or Docker

## Quick start

### Frontend only (guest mode)

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### With the backend

```bash
# 1. Database (once)
createdb solace   # or: docker run -d -p 5432:5432 -e POSTGRES_DB=solace -e POSTGRES_USER=solace -e POSTGRES_PASSWORD=change-me postgres:16
psql -c "create role solace login password 'change-me'"   # if not using the docker line above
psql -c "alter database solace owner to solace"

# 2. Backend (Flyway creates/updates the schema automatically on start)
cd backend
export SOLACE_DB_PASSWORD=change-me
SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run     # http://localhost:8080 (dev = plain-HTTP cookies + API docs)

# 3. Frontend — /api is proxied to the backend, so everything is same-origin
cd ../frontend
npm run dev
```

Open Settings → **Account** to register. Interactive API docs: <http://localhost:8080/swagger-ui.html> (dev profile). Full reference: [docs/API.md](docs/API.md).

### Docker Compose (PostgreSQL + backend + nginx)

```bash
cp .env.example .env          # set SOLACE_DB_PASSWORD; set SOLACE_COOKIE_SECURE=false if you test over plain HTTP
docker compose up --build     # http://localhost:8088
```

## Configuration

All deployment-specific values are environment variables; see [`.env.example`](.env.example) for every one (placeholders only).

| Variable | Purpose |
|---|---|
| `SOLACE_DB_URL` / `SOLACE_DB_USER` / `SOLACE_DB_PASSWORD` | PostgreSQL connection |
| `SOLACE_COOKIE_SECURE` | `true` (default) in production; `false` only for local HTTP |
| `SOLACE_CORS_ALLOWED_ORIGINS` | Empty = same-origin only (recommended) |
| `SOLACE_FILE_MAX_BYTES`, `SOLACE_FILE_QUOTA_BYTES` | Per-file limit and per-user quota |
| `SOLACE_RL_*` | Login/registration rate limits |
| `SOLACE_API_DOCS` | Expose Swagger UI (off by default) |
| `VITE_API_BASE_URL` | Frontend API base (default `/api`) |
| `VITE_BASE_PATH` | Serve the app under a sub-path (e.g. `/solace/`) |
| `VITE_DEV_PROXY_TARGET` | Where dev/preview proxy `/api` |

### Database migrations

Flyway runs on startup (`backend/src/main/resources/db/migration`). To run them without starting the app:
`mvn -f backend flyway:migrate` is **not** configured; start the app once, or use the Flyway CLI against the same folder. Add new schema changes as new `V<n>__name.sql` files — never edit applied ones.

## Testing

```bash
# Frontend unit/component tests (Vitest + React Testing Library) — 298 tests
cd frontend && npm test

# Frontend type-check + production build
npm run build

# Browser end-to-end (Playwright). Builds the app and serves it with `vite preview`.
npx playwright install chromium     # once (or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
npm run e2e                         # guest-mode journeys
E2E_BACKEND=1 npm run e2e           # + full-stack journeys; needs a running backend on :8080
                                    #   (start it with SOLACE_RL_REGISTER_PER_IP=1000 to avoid the registration limit)

# Backend (JUnit 5, Mockito, MockMvc; H2 in PostgreSQL mode) — 91 tests
cd backend && mvn test
# Same suite against real PostgreSQL:
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/solace_test SPRING_DATASOURCE_USERNAME=solace \
SPRING_DATASOURCE_PASSWORD=... SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver mvn test   # wipes that database's users!
```

## Production build & deployment

```bash
cd frontend && npm run build        # -> frontend/dist (static files, includes the offline service worker)
cd ../backend && mvn -DskipTests package   # -> backend/target/solace-os-backend-*.jar
java -jar target/solace-os-backend-*.jar
```

Recommended topology: **one domain**. Serve `frontend/dist` and proxy `/api/` to the backend from the same host (see [`deploy/nginx.conf`](deploy/nginx.conf), which also sets the CSP and other security headers). Terminate TLS in front, keep `SOLACE_COOKIE_SECURE=true`, and enable HSTS. Behind a reverse proxy the backend honours `X-Forwarded-*`; only expose it through a proxy you control (rate limiting keys on the client address).

Under a sub-path: build with `VITE_BASE_PATH=/solace/` and mount `dist` there; proxy `/solace/api/`→backend `/api/` or keep `/api` on the same host.

Single-instance notes: sessions and rate-limit counters are in memory. For several backend instances use sticky sessions, or add Spring Session JDBC and a shared limiter.

## Security overview

* Passwords: BCrypt (cost 12), min 10 chars, never logged or stored client-side. Sessions: HttpOnly + SameSite=Lax cookie, new session id on login, server-side invalidation on logout. CSRF: double-submit token on every mutation.
* Authorization on the server in every query; other users' ids look nonexistent (`404`). Account deletion cascades.
* Login/registration rate limiting (per IP and per username) with `Retry-After`.
* Uploads: extension allow-list + magic-byte/UTF-8 checks, size limit and quota enforced by the server, served only as attachments with `nosniff`.
* Frontend: no `eval`, no `dangerouslySetInnerHTML`, URL allow-listing (`http/https` only), wallpaper uploads sniffed, import files sanitised, strict CSP.
* Permissions: Solace never asks for camera, microphone, location or clipboard. Local files only via the browser's own picker.

## Browser limitations (by design)

* **Real filesystem:** browsers can't browse your whole disk. "This computer" uses the File System Access API (Chromium-based browsers) on a folder *you* pick, read-only, per session. Other browsers can still upload into Solace Files and download from it.
* **Solace Files** live in this browser's IndexedDB: clearing site data deletes them; they don't sync (use Cloud for that). Private windows may block IndexedDB — Solace warns and falls back to memory.
* **Terminal** is simulated. **Calendar** doesn't sync with Google/Outlook. **Web** can't embed sites (most forbid framing); it opens tabs.
* Battery in the tray appears only where the Battery API exists. Full-screen needs a user gesture.
* **Offline:** the shell and all local features work offline (service worker + IndexedDB). Sign-in, sync and Cloud files need the server.
* Documents, bookmarks, widgets and desktop-icon layout are **not** synced.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "No Solace server is available" in Settings → Account | The backend isn't reachable at `/api`. Start it, check `VITE_DEV_PROXY_TARGET`, then **Check again**. |
| Backend fails with connection refused / auth error | PostgreSQL not running, or wrong `SOLACE_DB_*`. |
| Can't stay signed in over plain HTTP | `SOLACE_COOKIE_SECURE` must be `false` without HTTPS (the `dev` profile does this). |
| `429 Too many attempts` | Rate limit hit; wait for `Retry-After` or raise `SOLACE_RL_*` for testing. |
| Uploads rejected (`422`) | Type not on the allow-list, or content doesn't match the extension. |
| Playwright can't find a browser | `npx playwright install chromium`, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome`. |
| Stale UI after a deploy | The service worker revalidates navigations; hard-refresh once, or unregister it in DevTools. |

## Project status

Phases 1–7 are implemented and verified (see test counts above). Known limitations and next steps:

* No password change / email recovery / multi-device session management (sessions end on logout, timeout, or account deletion).
* Text documents, bookmarks and widgets aren't synced; Cloud files have no sharing/versioning.
* Rate limiting and sessions are per-instance.
* Accessibility is tested with roles/labels, focus and contrast checks; a manual screen-reader pass is still recommended.
* Drag-and-drop between Solace Files and Cloud isn't supported (use download/upload).

## License

Add the license of your choice before publishing.
