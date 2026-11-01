# 13: Adopt SDK 0.6: the Plugin's data directory and status

**What to build:** fyflow-plugin-sdk 0.6.0 shipped what `.scratch/v1/upstream/fyflow-app-plugin-status.md` asked for (reply: `fyflow-app-plugin-status-reply.md`). The Plugin keeps its Cache and the Circuit breaker's block in the data directory the Host gives it, so a user no longer sets a Cache directory by hand. The Session's state shows on the Plugin's card on the Plugins page and in MCP's `list_plugins` through the Plugin's `status()`, which replaces the `AniDBStatus` Node Type.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The peer range is `^0.6.0`, and the Plugin sets `dataDir: true`.
- [x] The `cacheDir` Profile field is gone: Session Workers read `config.host.dataDir` and keep the Cache and the block there. A Worker given no data directory (as in tests) keeps answers in memory, as before.
- [x] Profiles share the Session when their account fields (`username`, `password`, `udpApiKey`) match.
- [x] The Plugin's `status(context)` reports the Session snapshot (state, account, queue, next send time, block), taking in a block kept in `context.dataDir` after a restart, without connecting, queuing or sending, and holding no secret.
- [x] `AniDBStatus` and its Worker are removed.
- [x] The smoke checks that the Host shows a status for the Plugin and that the Cache is in the Host's data directory.
- [x] Spec, ADRs and glossary say where the data now lives.

## Comments

- Decided by the maintainer: `cacheDir` is removed outright (no override; nothing to migrate before the first release), and `AniDBStatus` is dropped rather than kept beside the status.
- Workers take a `SessionConfig`: the Profile's Session fields plus the Host's `host.dataDir`. The Session compares only `username`, `password` and `udpApiKey` between Profiles; the data directory is the same for all.
- The status: `ok` when logged in or not yet logged in, `info` while logging in, `warning` while blocked; details give the account, queue, next send time and block, all ISO 8601. Tested through the Plugin's `status()` against the fake AniDB, as `AniDBStatus` was.
- From review: the Circuit breaker keeps one data directory instead of every directory seen (only Profiles naming different Cache directories needed that); the status test is `status.test.ts`, after its module.
- The smoke checks `hasStatus`, `GET /api/plugins/status` after the Run (logged in as the Profile's user, no secret), and the Cache file under `plugin-data/anidb/` in the Host's data directory. Passes on Node and Deno.
- A block another Host process sharing the data directory trips later is not seen by this one until it restarts, as before.
