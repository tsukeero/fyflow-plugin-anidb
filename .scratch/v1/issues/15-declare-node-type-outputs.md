# 15: Declare what each Node Type returns

**What to build:** A Flow author sees what each Node Type's Task returns, so the editor suggests an Edge condition's
paths (`found`, `added`, `anime.aid`) and a person marking a failed Task done gets a form for its result. Every Worker
declares a basic `outputSchema` (fyflow's subset): the outcome flags and ids typed, what every result carries
required, the fields that vary left open, and an example of each outcome.

**Blocked by:** 14 (Declare what each Node Type takes as input)

**Status:** done

- [x] Every Node Type's Worker declares an `outputSchema` fyflow takes, with a description and an example of each
      outcome (found and not found; added, already in MyList, edited, unknown file).
- [x] What each Worker returns, for every outcome its tests cover, meets its schema.
- [x] Fields passed through from the input, and fields a Flow asks AniDB for, stay allowed.

## Comments

- Asked by the maintainer: basic output schemas, beside the input schemas of ticket 14.
- Basic on purpose: the outcome flags (`found`, `added`, `edited`) and the ids are typed, and so are the episode's and
  the MyList entry's fields, which the library types. The fields a Flow asks AniDB for (`fields`) are left open: they
  vary, and AniDB answers some as text (`year: "1998"`) and some as numbers (`episodes: 26`).
- Only what every result carries is required (`found`; `added`; `path`, `size` and `ed2k`). A part only one outcome
  carries is optional, since the subset has no `anyOf`; an example shows each outcome.
- Tested where the results are: every result a Worker test asserts is also held to its Node Type's schema
  (`test/output-schema.ts`, fyflow's `findings`), so the schemas cannot drift from what the Workers return. Making
  `episode.epno` an integer fails three tests. The Plugin test checks each schema passes fyflow's `schemaProblem`.
- The schemas are in `src/outputs.ts`, beside `src/inputs.ts`.
