# 03: Request queue and a shared Session

**What to build:** However many Flows, Node Types, Profiles and Reloads are in play, a Host talks to AniDB through one Session, sending one request at a time at AniDB's pace. A Task waiting its turn shows its place, its expected wait and the Session account; a Task Cancelled while waiting leaves at once without sending anything. The Session logs out after 10 minutes with no requests. See ADR-0001 and the glossary for Session, Request queue and Session snapshot.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] One Session per Host process, registered on `globalThis` under a `Symbol.for` key: Worker instances of different Node Types and of different Profiles share it, and a second import of the Session's module reuses it.
- [ ] Session Worker pools are `maxThreads: 1`, `maxConcurrentTasks: 100`, so waiting Tasks reach `run()` and can say why they wait; Worker `setup()` borrows the Session and `teardown()` returns it without disconnecting.
- [ ] Requests are sent one at a time, no faster than AniDB allows, in arrival order; pacing is tested with an injectable clock, not real waits.
- [ ] A queued Task's progress message gives its place, expected wait and Session account, updated as the queue moves.
- [ ] Cancelling one queued Task, and cancelling a Run of 50 queued Tasks, ends every one of them `cancelled` at once with no packet sent for any of them. A Task whose request is already sent also ends at once; its late reply still goes to the Cache. (Inline Workers are never force-stopped by the scheduler, so this is the only thing that ends a cancelled Task.)
- [ ] After 10 minutes with no requests the Session logs out; the next Task connects again. A Worker instance retiring never disconnects the Session.
- [ ] When the Session is shut down, every queued request is rejected, so no `run()` is left waiting.
