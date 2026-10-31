# 01: Tracer bullet: `AniDBAnime` by aid through the Session against a fake AniDB

**What to build:** A Flow author can drop an `AniDBAnime` Node Type into a Flow, give it an `aid`, and get the anime's data back, with the Plugin logged in as the AniDB account set on the Task's Profile. This is the first path through every layer: the Plugin declaration with its Profile fields, an inline Session Worker, the Session (connecting on the first Task), the fake AniDB UDP server the tests talk to, and CI running the suite on Node 26 and Deno. See the spec (`.scratch/v1/spec.md`), ADR-0001 and the glossary for Session, Session Worker and Session account.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The Plugin (id `anidb`) declares Profile fields `username`, `password` (secret) and `udpApiKey` (secret, optional), all start-up fields, and the `AniDBAnime` Node Type taking them, inline, with a one-line description and an icon from the SDK's set.
- [x] `AniDBAnime` with `{ aid }` in its input returns the anime's data; the Session connects and logs in on the first Task, not at Worker setup, and with a `udpApiKey` set it logs in encrypted.
- [x] The Session never uses the library's default cache (it must not write into the working directory); until the Cache lands it runs with caching off.
- [x] A fake AniDB UDP server in the test suite answers scripted replies and records the packets it receives; tests drive Workers through `run(envelope, context)` as the Host does and assert on results and received packets.
- [x] Missing credentials fail the Task saying which Profile field to set.
- [x] `pnpm check` runs the suite (Node and Deno); the CI workflow runs it on Node 26 and on Deno. _Not yet seen running: it first runs on the next push._
- [x] The `pnpm build` output loads as the package entry and has the SDK's Plugin shape, with no TypeScript in it.

## Comments

- anidb-udp-client hard-codes `api.anidb.net:9000` and a 4-second request spacing. Tests reach the fake AniDB by redirecting `dgram` sends to that address while a fake runs; ticket 11's in-Host smoke needs another way in (ideally a `host`/`port` option in the library), and pacing tests in ticket 03 cannot shorten the library's own spacing.
- Left for later tickets, as the review noted: refusing a second account (09), the in-memory Cache and its warning (04), pool settings and idle logout (03), `found: false` (07), the registered client name (12).
