# Architecture

```
frontend/src
  app/            App boot, constants (accents, wallpapers, shortcuts, defaults)
  desktop/        Shell: wallpaper, icons, dock, tray, launcher, panels, menus, dialogs, widgets, welcome
  window-manager/ WindowFrame (drag/resize/snap), WindowLayer, global shortcuts
  applications/   One folder per app; each exports an AppDef (title, icon, sizes, lazy component)
  stores/         Zustand stores (settings, windows, ui, notes, tasks, events, docs, widgets…)
  services/       IndexedDB, Solace Files (virtual FS), local-folder access, API client, sync engine
  components/     Shared UI primitives (Modal, Switch, VirtualList, …)
  styles/         Design tokens (CSS variables) + Tailwind
backend/src/main/java/app/solace
  config/ security/ common/ ratelimit/   cross-cutting concerns
  user/ auth/ preferences/ notes/ tasks/ events/ files/   one package per feature (entity, repo, service, controller, DTOs)
backend/src/main/resources/db/migration   Flyway SQL (V1 accounts+synced data, V2 files)
```

## Key decisions

* **One window store.** Windows are plain data (`stores/windowStore.ts`); stacking order is the array order, so z-index can never drift. Dragging/resizing write straight to the DOM during the gesture and commit once on release, so apps never re-render while a window moves. Apps are lazy-loaded and memoised.
* **Storage strategy.** Preferences & window layout → `localStorage` (sync, tiny). Notes, tasks, events, documents → IndexedDB through a debounced zustand storage adapter (flushed on page hide). Solace Files → IndexedDB (metadata) + blobs. Server data lives in PostgreSQL and is *optional*: guest mode is complete on its own.
* **Honest capabilities.** Real folders on the user's computer are reached only via the File System Access API after an explicit picker, read-only. The terminal is a fixed command table, not a shell. No fake system telemetry, no fake integrations.
* **Sync** (`services/sync`): a pure three-way merge (`plan.ts`) compares *local*, *server* and the *signature at last sync*, so edits and deletions on either side propagate and conflicts resolve deterministically (newest wins, else server). Local edits push debounced; a full sync runs on sign-in, tab focus, reconnect and every 2 minutes. Offline is a first-class state.
* **Security model.** Server-side sessions in an HttpOnly cookie + double-submit CSRF; BCrypt; per-IP and per-username rate limits; ownership enforced inside every repository query (`WHERE owner = ?`, composite `(user_id, id)` keys); uploads validated by extension allow-list *and* content, always served as attachments; strict API response headers; narrow, opt-in CORS.
