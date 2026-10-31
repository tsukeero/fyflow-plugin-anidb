# 03: Request queue and a shared Session

**What to build:** However many Flows, Node Types, Profiles and Reloads are in play, a Host talks to AniDB through one Session, sending one request at a time at AniDB's pace. A Task waiting its turn shows its place, its expected wait and the Session account; a Task Cancelled while waiting leaves at once without sending anything. The Session logs out after 10 minutes with no requests. See ADR-0001 and the glossary for Session, Request queue and Session snapshot.

**Blocked by:** 01

**Status:** done

- [x] One Session per Host process, registered on `globalThis` under a `Symbol.for` key: Worker instances of different Node Types and of different Profiles share it, and a second import of the Session's module reuses it.
- [x] Session Worker pools are `maxThreads: 1`, `maxConcurrentTasks: 100`, so waiting Tasks reach `run()` and can say why they wait; Worker `setup()` borrows the Session and `teardown()` returns it without disconnecting.
- [x] Requests are sent one at a time, no faster than AniDB allows, in arrival order; pacing is tested with an injectable clock, not real waits.
- [x] A queued Task's progress message gives its place, expected wait and Session account, updated as the queue moves.
- [x] Cancelling one queued Task, and cancelling a Run of 50 queued Tasks, ends every one of them `cancelled` at once with no packet sent for any of them. A Task whose request is already sent also ends at once; its late reply still goes to the Cache. (Inline Workers are never force-stopped by the scheduler, so this is the only thing that ends a cancelled Task.)
- [x] After 10 minutes with no requests the Session logs out; the next Task connects again. A Worker instance retiring never disconnects the Session.
- [x] When the Session is shut down, every queued request is rejected, so no `run()` is left waiting.

## Comments

- Workers borrow the Session per request, with no `setup()`/`teardown()`: only the idle logout closes it, so a Worker instance retiring cannot disconnect it. The spec now says so.
- Pacing is tested with real time, not an injectable clock: anidb-udp-client spaces requests 4 s apart with its own real timers, which the Session cannot replace. A clock would only change the Session's estimate, not when packets go.
- The idle time is a test-only `resetSession({ idleMs })` option.
- From review: a logout finishes before the next login starts (no overlapping sessions), shutting down also rejects the request being sent, a refused login leaves no unhandled rejection, a throwing `sendProgress` cannot stall the queue, and the idle timer does not keep the Host's process alive.
- The Session already forgets a client the library disconnected after a fatal reply, so the next request logs in again; ticket 08 adds re-login and retry within one request.
