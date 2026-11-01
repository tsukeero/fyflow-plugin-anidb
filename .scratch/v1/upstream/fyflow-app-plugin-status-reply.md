# Reply from fyflow-app: Plugin status and a per-Plugin data directory

Answer to `fyflow-app-plugin-status.md`. Both parts shipped in **fyflow-plugin-sdk 0.6.0**. Both are opt-in: a Plugin that asks for neither works as before. The SDK's README ("A Plugin's data directory", "A Plugin's status") and UPGRADING.md ("0.5 to 0.6") are the reference. Below is what changed from the proposal, and what this Plugin needs to do.

## Compatibility

- `SDK_VERSION` is `0.6.0`, and `SDK_COMPATIBLE` is `["0.5.0"]`. A Host on 0.6 still loads a Plugin that declares `^0.5.0`, so this Plugin keeps working unchanged.
- Raise the peer range to `^0.6.0` once the Plugin sets `dataDir: true`. A Host on 0.5 would load it and give it no directory.

## 1. Plugin status

As proposed, with these differences:

- **Where it is declared.** `Plugin.status?(context)` may return a value or a promise of a `PluginStatus`. The shape is the one proposed: `level` is `ok`, `info`, `warning` or `error`; there is a one-line `summary` and optional `details` given as `{ label, value }` pairs.
- **What it is handed.** `context` is `{ dataDir }` when the Plugin asks for a data directory, and `{}` otherwise.
- **Its own endpoint.** It is not part of `GET /api/plugins`, so a slow Plugin never holds up the Plugins page.
  - `GET /api/plugins/status` returns `{ statuses: [{ id, status }] }`, and only for Enabled Plugins that have `status()`.
  - `PluginInfo` gains only `hasStatus: boolean`.
- **Refreshing.** The Plugins page asks every 5 s, only while it is open and only if some Plugin has a status. Nothing is sent over `/api/events`.
- **Bounded.** An answer that does not arrive within 1 s becomes an `error` status, and so does a `status()` that throws, rejects or returns a malformed status; the summary gives the reason. While a call is still pending, the Host waits on that call rather than starting another.
- **Redacted.** The summary and each detail are redacted of the Host's secrets, as errors and progress are.
- **MCP.** A new `list_plugins` tool gives each Plugin's id, version, whether it is Enabled, and its status. The Agent guide points to it for when a Plugin's Tasks wait or fail.
- **Where it runs.** On the Host's own thread, in the module the Host loaded. It sees state shared with `inline` Workers but not what threaded Workers hold.
  - That fits this Plugin: the Session Workers are inline, so `status()` can read the shared Session (`session.snapshot(...)`).

## 2. A per-Plugin data directory

As proposed, except for how Workers receive it:

- **Asked for, not given to all.** The Plugin sets `dataDir: true` in `definePlugin`. A Plugin that doesn't ask gets no directory at all.
- **Where it is.** `<dataDir>/plugin-data/<plugin id>/` under the Host's data directory, created before the Plugin's Workers are built.
  - It is kept across Reloads, updates and uninstall-reinstall.
  - The app never deletes it; there is no delete action for now. To start afresh, delete it by hand while the Host is stopped.
  - If the Host cannot create it, it logs a warning and hands the path on anyway, so the Plugin's own errors say what went wrong.
- **In the Worker's config, not on `PoolContext`.** fyflow-scheduler builds `PoolContext`, so the Host cannot add to it. Instead, each Worker of a Plugin that asks receives the path in its config as `config.host.dataDir` (type `HostConfig` from the SDK), on inline and threaded pools alike. `status()` receives it as `context.dataDir`.
  - That reserves the name `host`: a Plugin with `dataDir: true` may not have a start-up field named `host`, and the Host skips it with the reason.
  - This Plugin's start-up fields are `username`, `password`, `udpApiKey` and `cacheDir`, so there is no clash.
- **A shared place.** Several pool instances, and the Runtime a Reload just replaced, can run at the same time. Write to the folder as a shared place (a SQLite database, a file replaced atomically), not as one Worker's private file.

## Suggested adoption

1. Peer range `^0.6.0`, and `dataDir: true`.
2. Use `config.host.dataDir` as the Cache directory, and remove the `cacheDir` Profile field (from `SESSION_FIELDS` and the `AniDBStatus` pool's `profile`). Users then no longer set it by hand.
   - If an existing install's cache should carry over, it can be copied into `plugin-data/<plugin id>/` once.
3. Add `status(context)` built on the Session's snapshot, reading the Circuit breaker's block from `context.dataDir`, so that a ban shows on the Plugin's card and in `list_plugins` even when no Task is running.
   - The `AniDBStatus` Node Type can stay for Flows that branch on it, or be dropped.
