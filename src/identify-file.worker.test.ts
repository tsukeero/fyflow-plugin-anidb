import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import { meets, outputFindings } from "../test/output-schema.ts";
import IdentifyFile from "./identify-file.worker.ts";
import { resetSession } from "./session.ts";

const ED2K = "31d6cfe0d16ae931b73c59d7e0c089c0";
const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (input: unknown, settings: object = {}): TaskEnvelope<{ fields?: string[] }, never> => ({
  settings: { profile: {}, ...settings },
  input: input as never,
});

// The default fields, in AniDB's mask order after the fid: aid, eid, gid, state, crc32, audio codecs, video codec,
// resolution, romaji and English names, episode number and name, group short name. State 9 is CRC OK and version 3.
const bebop01 =
  "220 FILE\n312498|1|10|7|9|a1b2c3d4|AAC|H264/AVC|1920x1080|Cowboy Bebop|Cowboy Bebop|01|Asteroid Blues|GRP";

const file = (params: Record<string, string>) =>
  params.ed2k === ED2K && params.size === "734003200" ? bebop01 : "320 NO SUCH FILE";

let dataDir: string;
let alice: { username: string; password: string; host: { dataDir: string } };
let anidb: FakeAniDB | undefined;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "anidb-identify-"));
  alice = { username: "alice", password: "secret", host: { dataDir } };
});

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
  await rm(dataDir, { recursive: true, force: true });
});

describe("AniDBIdentifyFile", () => {
  it("identifies a file by ed2k and size, keeping the rest of its input", async () => {
    anidb = await startFakeAniDB({ handlers: { FILE: file } });
    const input = { path: "/media/bebop-01.mkv", size: 734003200, ed2k: ED2K, note: "kept" };

    const result = await new IdentifyFile(alice).run(task(input), context());

    expect(outputFindings("AniDBIdentifyFile", result)).toEqual([]);
    expect(result).toEqual({
      path: "/media/bebop-01.mkv",
      size: 734003200,
      ed2k: ED2K,
      note: "kept",
      found: true,
      file: {
        fid: 312498,
        state: "9",
        version: 3,
        crc32: "a1b2c3d4",
        audio_codecs: "AAC",
        video_codec: "H264/AVC",
        video_resolution: "1920x1080",
      },
      anime: { aid: 1, romanji_name: "Cowboy Bebop", english_name: "Cowboy Bebop" },
      episode: { eid: 10, epno: "01", ep_name: "Asteroid Blues" },
      group: { gid: 7, group_short_name: "GRP" },
    });
    expect(anidb.received.at(-1)?.params).toMatchObject({ ed2k: ED2K, size: "734003200" });
  }, 20_000);

  it("returns the fields a Flow asks for", async () => {
    anidb = await startFakeAniDB({
      handlers: { FILE: () => "220 FILE\n312498|1|10|7|Cowboy Bebop|01" },
    });

    const result = await new IdentifyFile(alice).run(
      task({ ed2k: ED2K, size: 734003200 }, { fields: ["romanji_name", "epno"] }),
      context(),
    );

    expect(outputFindings("AniDBIdentifyFile", result)).toEqual([]);
    expect(result).toMatchObject({
      found: true,
      file: { fid: 312498 },
      anime: { aid: 1, romanji_name: "Cowboy Bebop" },
      episode: { eid: 10, epno: "01" },
      group: { gid: 7 },
    });
  }, 20_000);

  it("returns only the fields asked for, even when the Cache holds more", async () => {
    anidb = await startFakeAniDB({ handlers: { FILE: file } });
    const worker = new IdentifyFile(alice);
    await worker.run(task({ ed2k: ED2K, size: 734003200 }), context());

    const result = await worker.run(
      task({ ed2k: ED2K.toUpperCase(), size: 734003200 }, { fields: ["romanji_name", "epno"] }),
      context(),
    );

    expect(outputFindings("AniDBIdentifyFile", result)).toEqual([]);
    expect(result).toEqual({
      ed2k: ED2K.toUpperCase(),
      size: 734003200,
      found: true,
      file: { fid: 312498 },
      anime: { aid: 1, romanji_name: "Cowboy Bebop" },
      episode: { eid: 10, epno: "01" },
      group: { gid: 7 },
    });
    // The upper-case hash is the same file: answered from the Cache.
    expect(anidb.commands().filter((command) => command === "FILE")).toHaveLength(1);
  }, 20_000);

  it("says Not found for a file AniDB does not know, and remembers it", async () => {
    anidb = await startFakeAniDB({ handlers: { FILE: file } });
    const worker = new IdentifyFile(alice);
    const input = { path: "/media/unknown.mkv", ed2k: "0123456789abcdef0123456789abcdef", size: 5 };

    expect(await meets("AniDBIdentifyFile", worker.run(task(input), context()))).toEqual({
      ...input,
      found: false,
    });
    expect(await meets("AniDBIdentifyFile", worker.run(task(input), context()))).toEqual({
      ...input,
      found: false,
    });

    expect(anidb.commands().filter((command) => command === "FILE")).toHaveLength(1);
  }, 20_000);

  it.each([
    ["ed2k", { size: 5 }],
    ["ed2k", { ed2k: "not-a-hash", size: 5 }],
    ["size", { ed2k: ED2K }],
    ["size", { ed2k: ED2K, size: -1 }],
  ])("fails naming `%s` when it is missing or malformed, sending nothing", async (field, input) => {
    anidb = await startFakeAniDB({ handlers: { FILE: file } });

    await expect(new IdentifyFile(alice).run(task(input), context())).rejects.toThrow(`\`${field}\``);
    expect(anidb.received).toEqual([]);
  });

  it("fails when `fields` names none", async () => {
    anidb = await startFakeAniDB({ handlers: { FILE: file } });

    await expect(
      new IdentifyFile(alice).run(task({ ed2k: ED2K, size: 5 }, { fields: [] }), context()),
    ).rejects.toThrow("`fields`");
    expect(anidb.received).toEqual([]);
  });

  it("fails naming a field AniDB does not have", async () => {
    anidb = await startFakeAniDB({ handlers: { FILE: file } });

    await expect(
      new IdentifyFile(alice).run(task({ ed2k: ED2K, size: 5 }, { fields: ["shoe_size"] }), context()),
    ).rejects.toThrow("shoe_size");
    expect(anidb.received).toEqual([]);
  });
});
