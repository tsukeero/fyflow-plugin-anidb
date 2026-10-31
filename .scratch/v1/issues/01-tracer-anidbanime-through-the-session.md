# 01: Tracer bullet: `AniDBAnime` by aid through the Session against a fake AniDB

**What to build:** A Flow author can drop an `AniDBAnime` Node Type into a Flow, give it an `aid`, and get the anime's data back, with the Plugin logged in as the AniDB account set on the Task's Profile. This is the first path through every layer: the Plugin declaration with its Profile fields, an inline Session Worker, the Session (connecting on the first Task), the fake AniDB UDP server the tests talk to, and CI running the suite on Node 26 and Deno. See the spec (`.scratch/v1/spec.md`), ADR-0001 and the glossary for Session, Session Worker and Session account.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The Plugin (id `anidb`) declares Profile fields `username`, `password` (secret) and `udpApiKey` (secret, optional), all start-up fields, and the `AniDBAnime` Node Type taking them, inline, with a one-line description and an icon from the SDK's set.
- [ ] `AniDBAnime` with `{ aid }` in its input returns the anime's data; the Session connects and logs in on the first Task, not at Worker setup, and with a `udpApiKey` set it logs in encrypted.
- [ ] The Session never uses the library's default cache (it must not write into the working directory); until the Cache lands it runs with caching off.
- [ ] A fake AniDB UDP server in the test suite answers scripted replies and records the packets it receives; tests drive Workers through `run(envelope, context)` as the Host does and assert on results and received packets.
- [ ] Missing credentials fail the Task saying which Profile field to set.
- [ ] `pnpm check` runs the suite; CI on GitHub Actions runs it on Node 26 and on Deno.
- [ ] The `pnpm build` output loads as the package entry and has the SDK's Plugin shape, with no TypeScript in it.
