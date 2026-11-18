import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostConfig, TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  BANNED_XML,
  BEBOP_XML,
  type FakeAniDBHttp,
  NOT_FOUND_XML,
  startFakeAniDBHttp,
} from "../test/fake-anidb-http.ts";
import { meets } from "../test/output-schema.ts";
import { CACHE_FILE } from "./cache.ts";
import { HTTP_BLOCK_FILE, HTTP_CLIENT, HTTP_CLIENT_VERSION, resetHttpApi } from "./http.ts";
import HttpAnime from "./http-anime.worker.ts";

const context = (signal = new AbortController().signal): WorkerContext => ({
  sendProgress: () => {},
  signal,
});
const task = (input: unknown): TaskEnvelope<never, never> => ({
  settings: { profile: {} } as never,
  input: input as never,
});
const inDataDir = (dataDir: string) => ({ host: { dataDir } as HostConfig });

const bebop = (params: Record<string, string>) => (params.aid === "1" ? BEBOP_XML : NOT_FOUND_XML);

let anidb: FakeAniDBHttp | undefined;
const dirs: string[] = [];
const dataDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "anidb-http-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  anidb?.restore();
  anidb = undefined;
  resetHttpApi();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("AniDBHTTPAnime", () => {
  it("returns an anime by aid from the HTTP API, as the Plugin's registered client, keeping the input", async () => {
    anidb = startFakeAniDBHttp(bebop);
    resetHttpApi();

    const result = await meets(
      "AniDBHTTPAnime",
      new HttpAnime({}).run(task({ aid: 1, path: "x.mkv" }), context()),
    );

    expect(result).toMatchObject({
      aid: 1,
      path: "x.mkv",
      found: true,
      anime: {
        aid: 1,
        restricted: false,
        type: "TV Series",
        episode_count: 26,
        start_date: "1998-04-03",
        titles: expect.arrayContaining([{ title: "Cowboy Bebop", lang: "x-jat", type: "main" }]),
        related_anime: [{ aid: 5, type: "Side Story", title: "Cowboy Bebop: Tengoku no Tobira" }],
        creators: [{ id: 4234, name: "Watanabe Shinichirou", type: "Direction" }],
        ratings: { permanent: { value: 8.7, count: 10000 }, mean: { value: 8.8, count: 11000 } },
        tags: [expect.objectContaining({ id: 2604, name: "space", weight: 600, local_spoiler: false })],
        episodes: [expect.objectContaining({ id: 1, epno: { type: 1, value: "1" }, length: 25 })],
      },
    });
    expect(anidb.received).toEqual([
      expect.objectContaining({
        request: "anime",
        aid: "1",
        client: HTTP_CLIENT,
        clientver: String(HTTP_CLIENT_VERSION),
        protover: "1",
      }),
    ]);
  });

  it("answers an anime again from the Cache in the data directory, asking AniDB once", async () => {
    anidb = startFakeAniDBHttp(bebop);
    const dir = dataDir();
    resetHttpApi();

    await new HttpAnime(inDataDir(dir)).run(task({ aid: 1 }), context());
    resetHttpApi(); // as after a restart: only the data directory remains
    const again = await new HttpAnime(inDataDir(dir)).run(task({ aid: 1 }), context());

    expect(again).toMatchObject({ found: true, anime: { aid: 1, type: "TV Series" } });
    expect(anidb.received).toHaveLength(1);
    expect(existsSync(join(dir, CACHE_FILE))).toBe(true);
  });

  it("gives an anime AniDB does not know as Not found, remembered, so AniDB is not asked again", async () => {
    anidb = startFakeAniDBHttp(bebop);
    resetHttpApi();
    const worker = new HttpAnime({});

    const result = await meets("AniDBHTTPAnime", worker.run(task({ aid: 999999 }), context()));
    const again = await worker.run(task({ aid: 999999 }), context());

    expect(result).toEqual({ aid: 999999, found: false });
    expect(again).toEqual({ aid: 999999, found: false });
    expect(anidb.received).toHaveLength(1);
  });

  it.each([
    ["no aid", { title: "Cowboy Bebop" }],
    ["an aid that is not an id", { aid: "1" }],
    ["no input", undefined],
  ])("refuses an input with %s, asking AniDB nothing", async (_, input) => {
    anidb = startFakeAniDBHttp(bebop);
    resetHttpApi();

    await expect(new HttpAnime({}).run(task(input), context())).rejects.toThrow(
      "AniDBHTTPAnime needs `aid` in its input",
    );
    expect(anidb.received).toEqual([]);
  });

  it("stops asking at a ban, and keeps the block in the data directory across a restart", async () => {
    anidb = startFakeAniDBHttp(() => BANNED_XML);
    const dir = dataDir();
    resetHttpApi();

    await expect(new HttpAnime(inDataDir(dir)).run(task({ aid: 1 }), context())).rejects.toThrow(
      /AniDB's HTTP API is blocked until .*after 555 BANNED/,
    );
    resetHttpApi();
    await expect(new HttpAnime(inDataDir(dir)).run(task({ aid: 2 }), context())).rejects.toThrow(
      "AniDB's HTTP API is blocked until",
    );

    expect(anidb.received).toHaveLength(1);
    expect(existsSync(join(dir, HTTP_BLOCK_FILE))).toBe(true);
  });

  it("sends one request at a time, and a Task Cancelled while waiting sends nothing", async () => {
    let answer: (body: string) => void = () => {};
    anidb = startFakeAniDBHttp((params) =>
      params.aid === "1" ? new Promise<string>((resolve) => (answer = resolve)) : BEBOP_XML,
    );
    resetHttpApi();
    const worker = new HttpAnime({});
    const cancel = new AbortController();

    const first = worker.run(task({ aid: 1 }), context());
    const second = worker.run(task({ aid: 2 }), context(cancel.signal));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(anidb.received.map((params) => params.aid)).toEqual(["1"]);

    cancel.abort(new Error("Cancelled"));
    await expect(second).rejects.toThrow("Cancelled");
    answer(BEBOP_XML);

    await expect(first).resolves.toMatchObject({ found: true });
    // Past the library's 2 seconds between requests, by when it would have sent the second.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(anidb.received.map((params) => params.aid)).toEqual(["1"]);
  }, 10_000);
});
