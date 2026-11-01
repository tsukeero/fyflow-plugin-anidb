import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import { meets } from "../test/output-schema.ts";
import Episode from "./episode.worker.ts";
import { resetSession } from "./session.ts";

const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (input: unknown): TaskEnvelope<never, never> => ({
  settings: { profile: {} } as never,
  input: input as never,
});
const alice = { username: "alice", password: "secret" };

// eid|aid|length|rating|votes|epno|eng|romaji|kanji|aired|type: a regular episode.
const asteroidBlues =
  "240 EPISODE\n10|1|25|850|12|1|Asteroid Blues|Asteroid Blues|Asteroid Blues|909619200|1";
const episode = {
  eid: 10,
  aid: 1,
  length: 25,
  rating: 850,
  votes: 12,
  epno: "1",
  eng: "Asteroid Blues",
  romaji: "Asteroid Blues",
  kanji: "Asteroid Blues",
  aired: 909619200,
  type: "",
};

const bebop = (params: Record<string, string>) =>
  params.eid === "10" || (params.aid === "1" && params.epno === "1") ? asteroidBlues : "340 NO SUCH EPISODE";

let anidb: FakeAniDB | undefined;

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
});

describe("AniDBEpisode", () => {
  it.each([
    ["eid", { eid: 10, path: "/media/bebop-01.mkv" }],
    ["aid and episode number", { aid: 1, epno: 1 }],
    ["aid and episode number as text", { aid: 1, epno: "1" }],
  ])("returns an episode by %s, keeping the rest of its input", async (_, input) => {
    anidb = await startFakeAniDB({ handlers: { EPISODE: bebop } });

    expect(await meets("AniDBEpisode", new Episode(alice).run(task(input), context()))).toEqual({
      ...input,
      found: true,
      episode,
    });
  });

  it("says Not found for an episode AniDB does not know, and remembers it", async () => {
    anidb = await startFakeAniDB({ handlers: { EPISODE: bebop } });
    const worker = new Episode(alice);

    for (const input of [{ eid: 99 }, { eid: 99 }, { aid: 1, epno: "S1" }])
      expect(await meets("AniDBEpisode", worker.run(task(input), context()))).toEqual({
        ...input,
        found: false,
      });

    expect(anidb.commands().filter((command) => command === "EPISODE")).toHaveLength(2);
  }, 30_000);

  it.each([
    ["nothing", {}],
    ["an aid without an episode number", { aid: 1 }],
    ["an eid that is not a whole number", { eid: "10" }],
    ["an empty episode number", { aid: 1, epno: "" }],
  ])("fails given %s, saying what it needs, sending nothing", async (_, input) => {
    anidb = await startFakeAniDB({ handlers: { EPISODE: bebop } });

    await expect(new Episode(alice).run(task(input), context())).rejects.toThrow(
      "needs `eid`, or `aid` and `epno`",
    );
    expect(anidb.received).toEqual([]);
  });
});
