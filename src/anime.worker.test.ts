import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import { meets, outputFindings } from "../test/output-schema.ts";
import Anime from "./anime.worker.ts";
import { resetSession } from "./session.ts";

const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (input: unknown, settings: object = {}): TaskEnvelope<never, never> => ({
  settings: { profile: {}, ...settings } as never,
  input: input as never,
});
const alice = { username: "alice", password: "secret" };

const bebop = (params: Record<string, string>) =>
  params.aid === "1" || params.aname === "Cowboy Bebop"
    ? "230 ANIME\n1|1998|TV Series|Cowboy Bebop|Cowboy Bebop|26"
    : "330 NO SUCH ANIME";

let anidb: FakeAniDB | undefined;

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
});

describe("AniDBAnime", () => {
  it("returns an anime by aid, with the Session logged in as the Session account", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });
    const worker = new Anime(alice);

    const result = await worker.run(task({ aid: 1 }), context());

    expect(outputFindings("AniDBAnime", result)).toEqual([]);
    expect(result).toEqual({
      aid: 1,
      found: true,
      anime: {
        aid: 1,
        year: "1998",
        type: "TV Series",
        romanji_name: "Cowboy Bebop",
        english_name: "Cowboy Bebop",
        episodes: 26,
      },
    });
    expect(anidb.commands()).toEqual(["AUTH", "ANIME"]);
    expect(anidb.received[0]?.params).toMatchObject({ user: "alice", pass: "secret" });
  });

  it("connects only when a Task runs, not when the Worker is built", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });

    new Anime(alice);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(anidb.received).toEqual([]);
  });

  it("logs in encrypted when the Profile sets a UDP API key", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop }, udpApiKey: "api-key" });
    const worker = new Anime({ ...alice, udpApiKey: "api-key" });

    const result = await worker.run(task({ aid: 1 }), context());

    expect(outputFindings("AniDBAnime", result)).toEqual([]);
    expect(result).toMatchObject({ found: true, anime: { romanji_name: "Cowboy Bebop" } });
    expect(anidb.commands()).toEqual(["ENCRYPT", "AUTH", "ANIME"]);
  }, 20_000);

  it.each([
    ["username", { password: "secret" }],
    ["password", { username: "alice" }],
  ])("fails naming the Profile field when %s is not set, sending nothing", async (field, fields) => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });
    const worker = new Anime(fields);

    await expect(worker.run(task({ aid: 1 }), context())).rejects.toThrow(
      `set \`${field}\` in the anidb section of this Task's Profile`,
    );
    expect(anidb.received).toEqual([]);
  });

  it("returns an anime by any of its titles, keeping the rest of its input", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });

    const result = await new Anime(alice).run(task({ title: "Cowboy Bebop", path: "/media" }), context());

    expect(outputFindings("AniDBAnime", result)).toEqual([]);
    expect(result).toMatchObject({
      title: "Cowboy Bebop",
      path: "/media",
      found: true,
      anime: { aid: 1, year: "1998" },
    });
    expect(anidb.received.at(-1)?.params).toMatchObject({ aname: "Cowboy Bebop" });
  });

  it("returns the fields a Flow asks for, and only those, even when the Cache holds more", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });
    const worker = new Anime(alice);
    await worker.run(task({ aid: 1 }), context());

    const result = await worker.run(task({ aid: 1 }, { fields: ["romanji_name"] }), context());

    expect(outputFindings("AniDBAnime", result)).toEqual([]);
    expect(result).toEqual({ aid: 1, found: true, anime: { aid: 1, romanji_name: "Cowboy Bebop" } });
    expect(anidb.commands().filter((command) => command === "ANIME")).toHaveLength(1);
  }, 20_000);

  it("says Not found for an anime AniDB does not know, and remembers it", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });
    const worker = new Anime(alice);

    for (const input of [{ aid: 2 }, { aid: 2 }, { title: "Nope" }])
      expect(await meets("AniDBAnime", worker.run(task(input), context()))).toEqual({
        ...input,
        found: false,
      });

    expect(anidb.commands().filter((command) => command === "ANIME")).toHaveLength(2);
  }, 30_000);

  it.each([
    ["no aid or title", {}],
    ["an aid that is not a whole number", { aid: "1" }],
    ["an empty title", { title: "" }],
  ])("fails given %s, saying what it needs, sending nothing", async (_, input) => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });

    await expect(new Anime(alice).run(task(input), context())).rejects.toThrow("needs `aid`, or `title`");
    expect(anidb.received).toEqual([]);
  });

  it("fails given an all-digit title, which the library's Cache would take for an aid", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });

    await expect(new Anime(alice).run(task({ title: "86" }), context())).rejects.toThrow("give its `aid`");
    expect(anidb.received).toEqual([]);
  });

  it("fails naming a field AniDB does not have", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });

    await expect(
      new Anime(alice).run(task({ aid: 1 }, { fields: ["shoe_size"] }), context()),
    ).rejects.toThrow("shoe_size");
    expect(anidb.received).toEqual([]);
  });
});
