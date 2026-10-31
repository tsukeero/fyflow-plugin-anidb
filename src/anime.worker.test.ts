import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import Anime from "./anime.worker.ts";
import { resetSession } from "./session.ts";

const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (input: unknown): TaskEnvelope<object, { aid?: unknown }> => ({
  settings: { profile: {} },
  input: input as { aid?: unknown },
});
const alice = { username: "alice", password: "secret" };

const bebop = (params: Record<string, string>) =>
  params.aid === "1" ? "230 ANIME\n1|1998|TV Series|Cowboy Bebop|Cowboy Bebop|26" : "330 NO SUCH ANIME";

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

    expect(result).toEqual({
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

  it("fails without a valid aid, sending nothing", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: bebop } });
    const worker = new Anime(alice);

    await expect(worker.run(task({ aid: "1" }), context())).rejects.toThrow("needs `aid`");
    expect(anidb.received).toEqual([]);
  });
});
