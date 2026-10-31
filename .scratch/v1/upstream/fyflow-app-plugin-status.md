# Request to fyflow-app: Plugin status and a per-Plugin data directory

From fyflow-plugin-anidb, a third-party Plugin whose Workers share one long-lived AniDB session (its ADR-0001). Two things it needs from the Host that no SDK version offers yet.

## 1. Plugin status

**Need.** The Plugin's Session can be connected, idle, queueing Tasks behind AniDB's rate limit, or blocked for hours by its Circuit breaker after a ban. None of that is visible unless a Task happens to be running: a Plugin's only live text in the UI is a running Task's progress message (`NodeTasks.tsx`, shown only for `state === "running"`); the Plugins page is computed once at load (`infoOf`, `warningsOf` in `runtime.ts`) and not refetched.

**Proposal.**

- The SDK's `Plugin` gains an optional `status?(): PluginStatus | Promise<PluginStatus>`, with a small shape the Host renders as data, not UI code (so ADR-0007's "Plugins ship no UI code" stands), e.g.:

  ```ts
  interface PluginStatus {
    level: "ok" | "info" | "warning" | "error";
    summary: string; // one line, e.g. "Logged in as alice · 3 queued"
    details?: Array<{ label: string; value: string }>; // e.g. "Blocked until" → "14:30"
  }
  ```

- `PluginInfoSchema` gains `status`; `GET /api/plugins` calls it (with a timeout, and a throwing `status()` shown as an error status, not a failed request).
- The Plugins page shows it on the Plugin's card and refreshes it while open: polling, or a `plugin-status` event on `/api/events`.
- MCP's plugin listing (if any) carries it too, so an Agent can see why AniDB Tasks fail.
- Secrets are redacted from it as from errors and progress.

## 2. A per-Plugin data directory

**Need.** AniDB requires clients to cache its answers, and the Plugin's Circuit breaker must survive a restart. A Plugin has no Host-given place to keep state (`PoolContext` holds only `terminateWithError`; `dataDir` never reaches a Plugin), so this Plugin asks for an absolute Cache directory as a Profile field, which every user must set by hand.

**Proposal.** The Host gives each Plugin a directory under its `dataDir`, e.g. `<dataDir>/plugin-data/<plugin id>/`, created on demand and kept across Reloads, updates and uninstall-reinstall (removed only on an explicit delete), handed to Workers (on `PoolContext`, say `pool.dataDir`) and to `status()`.

## Compatibility

Both are additions: an SDK minor version, with Plugins declaring the higher peer range only if they require them. fyflow-plugin-anidb will keep working without them (progress messages, an `AniDBStatus` Node Type, a Profile-set Cache directory) and adopt them when they ship.
