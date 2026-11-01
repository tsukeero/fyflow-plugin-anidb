import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meets, outputFindings } from "../test/output-schema.ts";
import HashFile from "./hash-file.worker.ts";

const CHUNK = 9_728_000;

// Byte i of a test file is (i * 7 + 3) & 0xff. The expected ed2k values were computed with Deno's node:crypto MD4,
// independently of the Worker's MD4, using AniDB's rule for sizes that are an exact multiple of the chunk size.
const vectors: Array<[string, number, string]> = [
  ["an empty file", 0, "31d6cfe0d16ae931b73c59d7e0c089c0"],
  ["a file under one chunk", 1000, "9a27d966bf4984d8597862b1c33bfbba"],
  ["a file one byte short of a chunk", CHUNK - 1, "066e7e02780d07a3462911120f3820d9"],
  ["a file of exactly one chunk", CHUNK, "35ec02d1b45374936f8d296bf9aec3a4"],
  ["a file one byte over a chunk", CHUNK + 1, "009e454784cc70263224d2cda42cf28f"],
  ["a file of exactly two chunks", 2 * CHUNK, "4c82fbfefb3168a3cfc64ba714070b1b"],
];

// AniDB keeps the "red" ed2k for an exact multiple of the chunk size, the empty chunk counted; its wiki's Ed2k-hash
// page publishes both variants for files of zeros, and these are its red ones (blue: d7def262…, 194ee9e4…).
const zeroVectors: Array<[string, number, string]> = [
  ["one chunk of zeros", CHUNK, "fc21d9af828f92a8df64beac3357425d"],
  ["two chunks of zeros", 2 * CHUNK, "114b21c63a74b6ca922291a11177dd5c"],
];

const content = (size: number) => {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 7 + 3) & 0xff;
  return bytes;
};

type Input = { path?: string };
const task = (path: unknown, roots: unknown): TaskEnvelope<object, Input> => ({
  settings: { profile: roots === undefined ? {} : { roots } },
  input: { path } as Input,
});

const context = (signal = new AbortController().signal) => {
  const progress: Array<[number, string | undefined]> = [];
  const value: WorkerContext = {
    sendProgress: (fraction, message) => {
      progress.push([fraction, message]);
    },
    signal,
  };
  return { progress, value };
};

let root: string;
let outside: string;

beforeAll(async () => {
  const base = await mkdtemp(join(tmpdir(), "anidb-hash-"));
  root = join(base, "media");
  outside = join(base, "elsewhere");
  await mkdir(root);
  await mkdir(outside);
  for (const [, size] of vectors) await writeFile(join(root, `${size}.bin`), content(size));
  for (const [, size] of zeroVectors) await writeFile(join(root, `zeros-${size}.bin`), new Uint8Array(size));
  await writeFile(join(outside, "secret.bin"), content(10));
  await writeFile(join(root, "..extras.bin"), content(1000));
});

afterAll(async () => {
  await rm(join(root, ".."), { recursive: true, force: true });
});

describe("AniDBHashFile", () => {
  it.each(vectors)("hashes %s", async (_name, size, ed2k) => {
    const path = join(root, `${size}.bin`);

    const result = await new HashFile().run(task(path, [root]), context().value);

    expect(outputFindings("AniDBHashFile", result)).toEqual([]);
    expect(result).toEqual({ path, size, ed2k });
  });

  it.each(zeroVectors)("hashes %s as AniDB's wiki publishes it", async (_name, size, ed2k) => {
    const path = join(root, `zeros-${size}.bin`);

    expect(await meets("AniDBHashFile", new HashFile().run(task(path, [root]), context().value))).toEqual({
      path,
      size,
      ed2k,
    });
  });

  it("reports progress by bytes read", async () => {
    const { progress, value } = context();

    await new HashFile().run(task(join(root, `${2 * CHUNK}.bin`), [root]), value);

    expect(progress.map(([fraction]) => fraction)).toEqual([0.5, 1]);
  });

  it("stops reading within one chunk when its Task is Cancelled", async () => {
    const controller = new AbortController();
    const chunksRead: number[] = [];
    const value: WorkerContext = {
      sendProgress: (fraction) => {
        chunksRead.push(fraction);
        controller.abort(new Error("Cancelled"));
      },
      signal: controller.signal,
    };

    await expect(new HashFile().run(task(join(root, `${2 * CHUNK}.bin`), [root]), value)).rejects.toThrow(
      "Cancelled",
    );
    expect(chunksRead).toEqual([0.5]);
  });

  it("hashes a file whose name starts with two dots", async () => {
    const path = join(root, "..extras.bin");

    const result = await new HashFile().run(task(path, [root]), context().value);

    expect(outputFindings("AniDBHashFile", result)).toEqual([]);
    expect(result).toEqual({ path, size: 1000, ed2k: "9a27d966bf4984d8597862b1c33bfbba" });
  });

  it("refuses every path when the Profile grants no Roots", async () => {
    await expect(
      new HashFile().run(task(join(root, "1000.bin"), undefined), context().value),
    ).rejects.toThrow("set `roots` in the anidb section of this Task's Profile");
  });

  it("refuses a relative path", async () => {
    await expect(new HashFile().run(task("media/1000.bin", [root]), context().value)).rejects.toThrow(
      "absolute path",
    );
  });

  it("refuses a path outside every Root", async () => {
    await expect(
      new HashFile().run(task(join(outside, "secret.bin"), [root]), context().value),
    ).rejects.toThrow("not under any of the Roots");
  });

  it("refuses a path escaping a Root through ..", async () => {
    // Not `join`, which would resolve the `..` before the Worker sees it.
    const escaping = `${root}${sep}..${sep}elsewhere${sep}secret.bin`;

    await expect(new HashFile().run(task(escaping, [root]), context().value)).rejects.toThrow(
      "not under any of the Roots",
    );
  });

  it("refuses every path while a Root is not absolute", async () => {
    await expect(
      new HashFile().run(task(join(root, "1000.bin"), [root, "media"]), context().value),
    ).rejects.toThrow("The Root media is not an absolute path");
  });

  it.runIf(process.platform === "win32")("refuses a path relative to the current drive", async () => {
    await expect(
      new HashFile().run(task(String.raw`\media\1000.bin`, [root]), context().value),
    ).rejects.toThrow("absolute path");
  });

  it("refuses a directory", async () => {
    await expect(new HashFile().run(task(root, [root]), context().value)).rejects.toThrow("is not a file");
  });

  it("refuses a symlink inside a Root to a file outside it", async (test) => {
    const link = join(root, "link.bin");
    try {
      await symlink(join(outside, "secret.bin"), link);
    } catch {
      test.skip(); // Creating symlinks needs a privilege Windows may not grant.
    }

    await expect(new HashFile().run(task(link, [root]), context().value)).rejects.toThrow(
      "not under any of the Roots",
    );
  });
});
