import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import MyListAdd from "./mylist-add.worker.ts";
import MyListGet from "./mylist-get.worker.ts";
import { resetSession } from "./session.ts";

const ED2K = "31d6cfe0d16ae931b73c59d7e0c089c0";
const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (input: unknown, settings: object = {}): TaskEnvelope<never, never> => ({
  settings: { profile: {}, ...settings } as never,
  input: input as never,
});

// lid|fid|eid|aid|gid|date|state|viewdate|storage|source|other|filestate: on the hard disk, watched, normal.
const ENTRY = "9001|312498|10|1|7|1700000000|1|1700001000|shelf|ed2k|first<br />second|0";
const entry = {
  lid: 9001,
  fid: 312498,
  eid: 10,
  aid: 1,
  gid: 7,
  date: 1700000000,
  state: "internal_storage",
  viewdate: 1700001000,
  storage: "shelf",
  source: "ed2k",
  other: "first\nsecond",
  filestate: "normal/original",
};

/** A MyList holding file 312498, known by its fid or by its ed2k and size. */
const holds = (params: Record<string, string>) =>
  params.fid === "312498" || (params.ed2k === ED2K && params.size === "734003200");

let cacheDir: string;
let alice: { username: string; password: string; cacheDir: string };
let anidb: FakeAniDB | undefined;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "anidb-mylist-"));
  alice = { username: "alice", password: "secret", cacheDir };
});

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
  await rm(cacheDir, { recursive: true, force: true });
});

describe("AniDBMyListGet", () => {
  it.each([
    ["fid", { fid: 312498 }],
    ["ed2k and size", { ed2k: ED2K, size: 734003200, path: "/media/bebop-01.mkv" }],
  ])(
    "finds a file's entry by %s, keeping the rest of its input, never from the Cache",
    async (_, input) => {
      anidb = await startFakeAniDB({
        handlers: { MYLIST: (params) => (holds(params) ? `221 MYLIST\n${ENTRY}` : "321 NO SUCH ENTRY") },
      });
      const worker = new MyListGet(alice);

      expect(await worker.run(task(input), context())).toEqual({ ...input, found: true, entry });
      expect(await worker.run(task(input), context())).toEqual({ ...input, found: true, entry });

      expect(anidb.commands().filter((command) => command === "MYLIST")).toHaveLength(2);
    },
    30_000,
  );

  it("says Not found for a file not in MyList, and asks again next time", async () => {
    anidb = await startFakeAniDB({ handlers: { MYLIST: () => "321 NO SUCH ENTRY" } });
    const worker = new MyListGet(alice);

    expect(await worker.run(task({ fid: 5 }), context())).toEqual({ fid: 5, found: false });
    expect(await worker.run(task({ fid: 5 }), context())).toEqual({ fid: 5, found: false });

    expect(anidb.commands().filter((command) => command === "MYLIST")).toHaveLength(2);
  }, 30_000);

  it.each([
    ["fid", { fid: 0 }],
    ["ed2k", { size: 5 }],
    ["size", { ed2k: ED2K }],
  ])("fails naming `%s` when the file is not named, sending nothing", async (field, input) => {
    anidb = await startFakeAniDB();

    await expect(new MyListGet(alice).run(task(input), context())).rejects.toThrow(`\`${field}\``);
    expect(anidb.received).toEqual([]);
  });
});

describe("AniDBMyListAdd", () => {
  it("adds a file with the settings' state and watched date, keeping the rest of its input", async () => {
    anidb = await startFakeAniDB({ handlers: { MYLISTADD: () => "210 MYLIST ENTRY ADDED\n9001" } });
    const input = { path: "/media/bebop-01.mkv", ed2k: ED2K, size: 734003200 };

    const result = await new MyListAdd(alice).run(
      task(input, { state: "internal_storage", viewed: true, viewdate: 1700001000, storage: "shelf" }),
      context(),
    );

    expect(result).toEqual({ ...input, added: true, lid: 9001 });
    expect(anidb.received.at(-1)?.params).toMatchObject({
      ed2k: ED2K,
      size: "734003200",
      state: "1",
      viewed: "1",
      viewdate: "1700001000",
      storage: "shelf",
    });
    expect(anidb.received.at(-1)?.params).not.toHaveProperty("edit");
  }, 20_000);

  it("adds a file by fid with no settings", async () => {
    anidb = await startFakeAniDB({ handlers: { MYLISTADD: () => "210 MYLIST ENTRY ADDED\n9002" } });

    expect(await new MyListAdd(alice).run(task({ fid: 312498 }), context())).toEqual({
      fid: 312498,
      added: true,
      lid: 9002,
    });
    expect(anidb.received.at(-1)?.params).toMatchObject({ fid: "312498" });
  }, 20_000);

  it("leaves a file already in MyList as it is, never from the Cache", async () => {
    anidb = await startFakeAniDB({ handlers: { MYLISTADD: () => `310 FILE ALREADY IN MYLIST\n${ENTRY}` } });
    const worker = new MyListAdd(alice);

    for (let run = 0; run < 2; run++)
      expect(await worker.run(task({ fid: 312498 }, { viewed: true }), context())).toEqual({
        fid: 312498,
        added: false,
        lid: 9001,
        entry,
      });

    expect(anidb.commands().filter((command) => command === "MYLISTADD")).toHaveLength(2);
  }, 30_000);

  it("with `edit`, updates an entry already in MyList", async () => {
    anidb = await startFakeAniDB({
      handlers: {
        MYLISTADD: (params) =>
          params.lid === "9001" && params.edit === "1"
            ? "311 MYLIST ENTRY EDITED\n1"
            : `310 FILE ALREADY IN MYLIST\n${ENTRY}`,
      },
    });

    const result = await new MyListAdd(alice).run(
      task({ fid: 312498 }, { edit: true, state: "deleted", viewed: false }),
      context(),
    );

    expect(result).toEqual({ fid: 312498, added: false, edited: true, lid: 9001 });
    expect(anidb.received.at(-1)?.params).toMatchObject({ lid: "9001", edit: "1", state: "3", viewed: "0" });
  }, 30_000);

  it("with `edit`, says Not found when the entry leaves MyList before it is edited", async () => {
    anidb = await startFakeAniDB({
      handlers: {
        MYLISTADD: (params) =>
          params.lid === "9001"
            ? "411 NO SUCH MYLIST ENTRY"
            : `310 FILE ALREADY IN MYLIST
${ENTRY}`,
      },
    });

    expect(await new MyListAdd(alice).run(task({ fid: 312498 }, { edit: true }), context())).toEqual({
      fid: 312498,
      added: false,
      found: false,
    });
  }, 30_000);

  it("with `edit`, adds a file not yet in MyList", async () => {
    anidb = await startFakeAniDB({ handlers: { MYLISTADD: () => "210 MYLIST ENTRY ADDED\n9003" } });

    expect(await new MyListAdd(alice).run(task({ fid: 312498 }, { edit: true }), context())).toEqual({
      fid: 312498,
      added: true,
      lid: 9003,
    });
    expect(anidb.commands().filter((command) => command === "MYLISTADD")).toHaveLength(1);
  }, 20_000);

  it("says Not found for a file AniDB does not know", async () => {
    anidb = await startFakeAniDB({ handlers: { MYLISTADD: () => "320 NO SUCH FILE" } });
    const input = { ed2k: ED2K, size: 5 };

    expect(await new MyListAdd(alice).run(task(input), context())).toEqual({
      ...input,
      added: false,
      found: false,
    });
  }, 20_000);

  it("fails naming a MyList state AniDB does not have, sending nothing", async () => {
    anidb = await startFakeAniDB();

    await expect(new MyListAdd(alice).run(task({ fid: 1 }, { state: "on_fire" }), context())).rejects.toThrow(
      "on_fire",
    );
    expect(anidb.received).toEqual([]);
  });
});
