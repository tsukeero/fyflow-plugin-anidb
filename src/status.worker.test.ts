import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import Anime from "./anime.worker.ts";
import { resetSession } from "./session.ts";
import Status from "./status.worker.ts";

const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (input: unknown = null): TaskEnvelope<never, never> => ({
  settings: { profile: {} } as never,
  input: input as never,
});
const anime = (params: Record<string, string>) =>
  `230 ANIME\n${params.aid}|1998|TV Series|Anime ${params.aid}|Anime ${params.aid}|26`;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

let cacheDir: string;
let alice: { username: string; password: string; udpApiKey: string; cacheDir: string };
let anidb: FakeAniDB | undefined;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "anidb-status-"));
  alice = { username: "alice", password: "alice-secret", udpApiKey: "alice-key", cacheDir };
});

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
  await rm(cacheDir, { recursive: true, force: true });
});

describe("AniDBStatus", () => {
  it("reports a Session not yet opened, without opening it", async () => {
    anidb = await startFakeAniDB();

    const status = await new Status({ cacheDir }).run(task(), context());

    expect(status).toEqual({
      state: "disconnected",
      account: null,
      queued: 0,
      nextSendAt: expect.stringMatching(ISO),
      blockedUntil: null,
    });
    expect(anidb.received).toEqual([]);
  });

  it("reports the Session while Tasks wait, at once, never queuing behind them or sending anything", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime }, udpApiKey: "alice-key" });
    const worker = new Anime(alice);
    const tasks = [worker.run(task({ aid: 1 }), context()), worker.run(task({ aid: 2 }), context())];

    const start = performance.now();
    const status = await new Status({ cacheDir }).run(task(), context());

    expect(performance.now() - start).toBeLessThan(100);
    expect(status).toMatchObject({ state: "connecting", account: "alice", queued: 1, blockedUntil: null });
    expect(Date.parse((status as { nextSendAt: string }).nextSendAt)).toBeGreaterThan(Date.now() + 3_000);
    await Promise.all(tasks);
    expect(anidb.commands()).toEqual(["ENCRYPT", "AUTH", "ANIME", "ANIME"]);
    expect(JSON.stringify(status)).not.toMatch(/alice-secret|alice-key/);
  }, 30_000);

  it("reports a logged-in Session, and when it may next send", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    await new Anime({ username: "alice", password: "alice-secret" }).run(task({ aid: 1 }), context());

    const status = await new Status({}).run(task(), context());

    expect(status).toMatchObject({ state: "connected", account: "alice", queued: 0, blockedUntil: null });
    const nextSendAt = Date.parse((status as { nextSendAt: string }).nextSendAt);
    expect(nextSendAt).toBeGreaterThan(Date.now() + 2_000);
    expect(nextSendAt).toBeLessThanOrEqual(Date.now() + 4_000);
  }, 30_000);

  it("reports a Circuit breaker block", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: () => "555 BANNED" }, udpApiKey: "alice-key" });
    await new Anime(alice).run(task({ aid: 1 }), context()).catch(() => {});

    const status = await new Status({ cacheDir }).run(task(), context());

    expect(status).toMatchObject({ state: "blocked", blockedUntil: expect.stringMatching(ISO) });
    expect(Date.parse((status as { blockedUntil: string }).blockedUntil)).toBeGreaterThan(
      Date.now() + 29 * 60_000,
    );
  }, 30_000);

  it("reports a block kept in its Profile's Cache directory, after a restart", async () => {
    const until = Date.now() + 10 * 60_000;
    await writeFile(join(cacheDir, "anidb-block.json"), JSON.stringify({ until, trips: 1 }));
    anidb = await startFakeAniDB();

    const status = await new Status({ cacheDir }).run(task(), context());

    expect(status).toMatchObject({ state: "blocked", blockedUntil: new Date(until).toISOString() });
    expect(anidb.received).toEqual([]);
  });

  it("fails when its Profile's Cache directory is not an absolute path", async () => {
    await expect(
      Promise.resolve(new Status({ cacheDir: "relative" }).run(task(), context())),
    ).rejects.toThrow("not an absolute path");
  });
});
