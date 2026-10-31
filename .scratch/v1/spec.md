Status: ready-for-agent

# v1: Identify files on AniDB and manage MyList from fyflow Flows

## Problem Statement

A fyflow-app user with a folder of anime video files wants Flows that work out what each file is (which anime, episode and release group) and record it in their AniDB MyList, so files can be renamed, sorted and tracked automatically. AniDB offers this over its UDP API, but the API is unforgiving: one packet every few seconds, one session per account, clients must be registered, answers must be cached, and a client that floods or juggles sessions is banned for hours, often silently. A fyflow-app Host, meanwhile, runs Workers in many pools and copies, across Profiles and overlapping Runtimes after a Reload. A naive Plugin, one AniDB client per Worker, would get its user banned.

## Solution

`fyflow-plugin-anidb`, a Plugin installed from npm into a Host's Plugin directory. It contributes Node Types to hash a file (ed2k), identify it on AniDB, read and add MyList entries, look up anime and episodes, and report the Session's state. Every AniDB Node Type borrows one Session per Host, which paces requests, caches answers, logs in again when the session expires, and stops talking to AniDB at the first sign of a ban until the block passes. The user sets their AniDB account, a Cache directory and the Roots files may be hashed under on a Profile; Flows chain the Node Types like any other.

## User Stories

1. As a fyflow-app user, I want to install the Plugin with npm into my Host's Plugin directory, so that its Node Types appear in the palette after a Reload.
2. As a user, I want to set my AniDB username, password and optional UDP API key on a Profile, so that the Plugin can log in as me.
3. As a user, I want my password and UDP API key to be secrets, so that the Host never shows them again or writes them into a Flow, error or log.
4. As a user, I want my username shown in status and progress messages, so that I can see which account the Session uses.
5. As a user, I want to set a Cache directory on a Profile, so that AniDB answers persist across Host restarts and I am not banned for asking again.
6. As a user without a Cache directory, I want the Plugin to work with an in-memory Cache and warn me, so that I can try it before configuring storage.
7. As a user, I want to grant Roots on a Profile, so that hashing reads only the folders I allow.
8. As a user, I want hashing refused, with a message naming the Roots field, when no Roots are set, so that a Flow cannot read arbitrary files by default.
9. As a Flow author, I want an `AniDBHashFile` Node Type that takes `{ path }` and returns `{ path, size, ed2k }`, so that I can identify files AniDB knows.
10. As a Flow author, I want hashing to report progress by bytes read, so that I can watch large files being hashed.
11. As a Flow author, I want hashing to stop promptly when its Task is Cancelled, so that a cancelled Run frees the disk.
12. As a Host operator, I want hashing to take the Host's `disk` and `cpu` groups, so that it shares their budgets with other Plugins.
13. As a Flow author, I want an `AniDBIdentifyFile` Node Type that takes `{ ed2k, size }` and returns `{ found, file, anime, episode, group }`, so that I can name and sort the file.
14. As a Flow author, I want `AniDBIdentifyFile` to pass every other input field through, `path` included, so that the next Node still knows which file it was.
15. As a Flow author, I want to choose which AniDB fields come back with a `fields` setting, so that I get what my Flow uses.
16. As a Flow author, I want a sensible default `fields` set (romaji and English titles, episode number and title, group short name, resolution, codecs, CRC, version), so that a common renaming Flow needs no settings.
17. As a Flow author, I want a file AniDB does not know to give `found: false`, not a failed Task, so that my Flow can route it elsewhere.
18. As a Flow author, I want an `AniDBMyListAdd` Node Type taking `{ fid }` or `{ ed2k, size }` plus state and watched fields, so that identified files land in my MyList.
19. As a Flow author, I want adding a file already in MyList to succeed with `{ added: false, lid, entry }`, so that re-running a Flow is harmless.
20. As a Flow author, I want an `edit: true` setting on `AniDBMyListAdd`, so that I can update an existing entry's state or watched date.
21. As a Flow author, I want an `AniDBMyListGet` Node Type, so that I can check whether and how a file is in my MyList.
22. As a Flow author, I want an `AniDBAnime` Node Type by `aid` or title, so that I can enrich Flows with anime data.
23. As a Flow author, I want an `AniDBEpisode` Node Type by `eid` or `aid` and episode number, so that I can get episode data.
24. As a Flow author, I want an `AniDBStatus` Node Type returning the Session snapshot, so that a small Flow (or an Agent over MCP) can see whether AniDB is usable.
25. As a user, I want all AniDB traffic from my Host to go through one Session, whatever the Profiles, Node Types and Reloads, so that I am never banned for parallel sessions.
26. As a user, I want the Session to send no faster than AniDB allows, so that I am never banned for flooding.
27. As a user, I want the Session to connect only when a Task needs it and log out after 10 minutes with no Tasks, so that it neither holds an idle session forever nor logs in over and over.
28. As a Flow author, I want a Task waiting in the Request queue to show its place and expected wait as its progress message, so that I can tell a slow Run from a stuck one.
29. As a Flow author, I want a Task Cancelled while queued to leave the queue without sending anything, so that cancelling saves AniDB budget.
30. As a user, I want an expired AniDB session to be logged into again once and the request retried, so that long-lived Hosts keep working.
31. As a user, I want the first sign of a ban to stop all AniDB traffic, so that the ban is not extended by more requests.
32. As a Flow author, I want AniDB Tasks during a block to fail at once with the time it lifts, so that I know when to retry.
33. As a user, I want the block to survive a Host restart, so that restarting does not resume hammering AniDB.
34. As a user, I want repeated bans to block for longer each time, so that a persistent problem does not cycle into longer bans.
35. As a user with two Profiles naming different AniDB accounts, I want the second account's Tasks to fail clearly while the Session is held by the first, so that I understand why rather than being banned.
36. As a user, I want answers asked for again within their cache lifetime to be served from the Cache, so that I respect AniDB's caching rule.
37. As a user, I want MyList answers never cached, so that I always see my list as it is.
38. As a user, I want Not found answers re-checked after a day, so that a file added to AniDB later is found.
39. As a user, I want the Plugin to work on a server Host on Node and on Deno, and in the desktop app, so that I can run it wherever I run fyflow-app.
40. As a user, I want the Plugin to keep working after a Reload, with Runs started before it finishing on the same Session, so that Reloading is safe mid-work.
41. As a maintainer, I want tests to run against a fake AniDB, so that no test run can get anyone banned.

## Implementation Decisions

- **Plugin identity.** Plugin id `anidb`; Node Types `AniDBHashFile`, `AniDBIdentifyFile`, `AniDBMyListAdd`, `AniDBMyListGet`, `AniDBAnime`, `AniDBEpisode`, `AniDBStatus`. Peer range `fyflow-plugin-sdk ^0.5.0`; the package ships compiled JavaScript.
- **Session (ADR-0001).** One Session per Host process, in its own module, registered on `globalThis` under a `Symbol.for` key so a second import never makes a second one. It wraps one `AnidbUDPClient`, created with this Plugin's Cache and logging, and owns:
  - the Request queue: cancel-aware, honouring each Task's abort signal while queued, handing the library one request at a time, paced at AniDB's limits (the library's own 4-second spacing stays as a floor);
  - lazy connect on the first request, idle logout after 10 minutes with no requests;
  - the Session snapshot: state (disconnected, connecting, connected, blocked), Session account, queue length, next send time, block-until time.
- **Session Workers.** Every AniDB Node Type except hashing is `inline`, with `pool: { maxThreads: 1, maxConcurrentTasks: 100 }` so waiting Tasks reach `run()`. They borrow the Session for each request; a Worker's lifecycle never touches it, so instances retiring never disconnect it (only the idle logout does). While queued they report `sendProgress` with their place and wait, carrying the Session account.
- **Session fields (ADR-0002).** The Session is opened with the start-up fields of the first Profile to use it. A Task whose Profile's account, credentials or Cache directory differ fails saying which account holds the Session; once the Session idles out, the next Profile may open it.
- **Profile.** Fields: `username` (start-up), `password` (start-up, secret), `udpApiKey` (start-up, secret, optional; enables encryption), `cacheDir` (start-up, absolute path, optional), `roots` (per-Task, Profile-only, list of absolute paths). Only `AniDBHashFile` takes `roots`; Session Workers take the rest.
- **Client identity.** The Session uses `anidb-udp-client`'s default client name and its hard-coded `clientver=1`; this Plugin registers no client of its own (ticket 12, wontfix).
- **Errors (ADR-0003).**
  - Not found codes become `{ found: false }` results.
  - `310` on MyList add becomes `{ added: false, lid, entry }`.
  - `501`/`506`: log in once more and retry the request.
  - `555`, a run of timeouts, `503`/`504`: trip the Circuit breaker for 30 minutes, doubling on each trip (cap to be set in implementation, at most 24 hours), persisted in the Cache directory. While tripped, every AniDB Task fails at once with the block-until time.
  - Other AniDB errors fail the Task with the AniDB code and label. No default `retryPolicy` on any Node Type.
- **Cache (ADR-0004).** Implements the library's cache interface on `node:sqlite` in the Cache directory, writing as it goes, or in memory with no directory. Lifetimes by the library's key prefix: anime, episode and group 7 days; file 30 days; Not found 1 day; MyList never.
- **`fields`.** `AniDBIdentifyFile` and `AniDBAnime` take a `fields` setting validated against the library's field names, with a default set. The result holds the requested fields; the library's cache merges partial answers, and widening `fields` asks AniDB for the full set again, refreshing the cached answer.
- **Hashing (ADR-0005).** `AniDBHashFile` is threaded, takes the `disk` and `cpu` groups, refuses paths not absolute or outside `roots` (resolved, so `..` and symlinks cannot escape), streams the file in 9,728,000-byte chunks through `hash-wasm`'s MD4, reports progress by bytes, checks its abort signal between chunks, and appends the empty-chunk hash when the size is an exact multiple of the chunk size.
- **Input conventions.** Paths are absolute, as fyflow.fs's are, so a fyflow.fs listing can feed hashing. `AniDBIdentifyFile` spreads its input into its result before adding its own fields.
- **Library changes upstream** (tracked on anidb-udp-client): optional automatic re-login on `501`/`506`, and separate codes for `NOT_CONNECTED` and `FAILED_TO_INITIALIZE`. The Plugin's own re-login stays until the library's ships.
- **fyflow-app changes upstream** (request in `.scratch/v1/upstream/fyflow-app-plugin-status.md`): Plugin status on the Plugins page, and a per-Plugin data directory. Not needed for v1.

## Testing Decisions

- **Good tests** drive the Plugin only where the Host does, and observe only what a Host or Flow sees: results, failures, progress messages, packets sent to AniDB. Never the Session's internals.
- **Seam 1, the Worker contract against a fake AniDB.** Tests build each Node Type's Worker with Profile config and call `run(envelope, context)` as the Host does. An in-process fake AniDB UDP server (a `node:dgram` socket replying from a script) stands in for AniDB; the Session, Request queue, Circuit breaker and Cache are real. Covers Identification, MyList, lookups, Not found, pacing (with an injectable clock where waiting would be slow), re-login, ban and block persistence, Cancel while queued, account conflicts, Cache lifetimes, and Session sharing between Worker instances of different Node Types and Profiles.
- **Hashing** uses the same seam with temporary files: known ed2k vectors, an empty file, a file of exactly one chunk, and one of an exact multiple of the chunk size; Roots refusal including `..` and symlink escapes; Cancel mid-file.
- **CI** runs seam 1 on Node 26 and Deno.
- **Seam 2, a local Host smoke** (`pnpm smoke`): the built package in a Plugin directory of a Host built from `../fyflow-app`, running a Flow (hash → identify → MyList add) against the fake AniDB on Node and Deno. Local only, since fyflow-app is not on npm.
- **Prior art.** fyflow-app's `examples/plugins/signer` and its `package:smoke` and `test:deno` scripts, which load a Plugin from a Plugin directory as npm installs it.
- **Never against real AniDB in automated tests.**

## Out of Scope

- MyList delete, votes, calendar, `updated`, group status, notifications and messages.
- Monitoring or triggering Runs (fyflow-app has no triggers).
- Plugin actions such as "Disconnect" or "Clear block".
- Serving more than one AniDB account per Host at a time.
- AniDB's HTTP API and image downloads.
- Renaming or moving files: Flows do that with fyflow.fs.
- A configurable `clientver`, or a client name registered for this Plugin.

## Further Notes

- Before release: drop `"private": true` and make the repo public.
- When fyflow-app ships Plugin status and a per-Plugin data directory, adopt both: status from the Session snapshot, and the data directory as the default Cache directory.
- AniDB's wiki could not be read directly while designing; its rate limits and ban behaviour came from search extracts and other clients' docs. Recheck the exact limits before release.
