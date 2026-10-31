# 07: `AniDBEpisode`, and `AniDBAnime` by title

**What to build:** A Flow author can look up an episode by `eid` or by `aid` and episode number, and an anime by any of its titles as well as by `aid`, choosing the fields that come back. Unknown ones give `found: false`.

**Blocked by:** 01

**Status:** done

- [x] `AniDBEpisode` (Session Worker) with `{ eid }` or `{ aid, epno }` returns `{ found: true, episode }` or `{ found: false }`.
- [x] `AniDBAnime` also takes `{ title }` and has a `fields` setting with a default set; an unknown aid or title returns `{ found: false }`.
- [x] Input in neither form fails the Task saying what is expected.
- [x] Both pass other input fields through.

## Comments

- `AniDBAnime`'s result now keeps its input, like every other Session Worker: `{ aid, found, anime }` where ticket 01 gave `{ found, anime }`.
- Not found is remembered for a day under keys tagged by form (`ANIME:aid=…`, `ANIME:title=…`, `EPISODE:<eid>`, `EPISODE:<aid>:<epno>`), so a title never answers for an aid.
- An all-digit title is refused, asking for the `aid`: anidb-udp-client keys its Cache by `ANIME:<aid or title>` alike, so the title `86` would read aid 86's record, and an alias it writes could overwrite it. Library issue, for the user to take up.
- Library limits found in review, left to the user: the library keeps no alias for the title searched by, only for the names in the answer, so a short name, synonym or other letter case asks AniDB again each time. Widening `fields` sends the full mask, not only the missing fields: intended, per the maintainer (2026-10-31), since it refreshes the whole cached answer.
- `epno` is passed as given: "01" and "1" are separate Cache entries.
- The result holds only the fields asked for, as in `AniDBIdentifyFile`. `fields` validation and its `settingsSchema` are shared (`chosenFields`, `fieldsSchema`); `AniDBIdentifyFile`'s unknown-field message now reads "AniDBIdentifyFile has no field …".
