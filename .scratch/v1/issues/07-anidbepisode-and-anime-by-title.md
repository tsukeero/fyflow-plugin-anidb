# 07: `AniDBEpisode`, and `AniDBAnime` by title

**What to build:** A Flow author can look up an episode by `eid` or by `aid` and episode number, and an anime by any of its titles as well as by `aid`, choosing the fields that come back. Unknown ones give `found: false`.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `AniDBEpisode` (Session Worker) with `{ eid }` or `{ aid, epno }` returns `{ found: true, episode }` or `{ found: false }`.
- [ ] `AniDBAnime` also takes `{ title }` and has a `fields` setting with a default set; an unknown aid or title returns `{ found: false }`.
- [ ] Input in neither form fails the Task saying what is expected.
- [ ] Both pass other input fields through.
