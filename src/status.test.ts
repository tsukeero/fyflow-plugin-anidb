// The Plugin's status: the Session snapshot on the Plugin's card and in MCP's `list_plugins`, so a user or an Agent
// can see whether AniDB is usable even when no Task runs.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginStatus, PluginStatusContext, TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import Anime from "./anime.worker.ts";
import plugin from "./plugin.ts";
import { resetSession } from "./session.ts";

const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (aid: number): TaskEnvelope<never, never> => ({
  settings: { profile: {} } as never,
  input: { aid } as never,
});
const anime = (params: Record<string, string>) =>
  `230 ANIME\n${params.aid}|1998|TV Series|Anime ${params.aid}|Anime ${params.aid}|26`;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

const status = (statusContext: PluginStatusContext) => {
  if (plugin.status === undefined) throw new Error("The Plugin has no status()");
  return Promise.resolve(plugin.status(statusContext));
};
const detail = ({ details }: PluginStatus, label: string) =>
  details?.find((pair) => pair.label === label)?.value;

let dataDir: string;
let alice: { username: string; password: string; udpApiKey: string; host: { dataDir: string } };
let anidb: FakeAniDB | undefined;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "anidb-status-"));
  alice = { username: "alice", password: "alice-secret", udpApiKey: "alice-key", host: { dataDir } };
});

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
  await rm(dataDir, { recursive: true, force: true });
});

describe("the Plugin's status", () => {
  it("reports a Session not yet opened, without opening it", async () => {
    anidb = await startFakeAniDB();

    const reported = await status({ dataDir });

    expect(reported).toMatchObject({ level: "ok", summary: "Not logged in: the next AniDB Task logs in" });
    expect(detail(reported, "Queued")).toBe("0");
    expect(detail(reported, "Next send")).toMatch(ISO);
    expect(detail(reported, "Blocked until")).toBeUndefined();
    expect(anidb.received).toEqual([]);
  });

  it("reports the Session while Tasks wait, at once, never queuing behind them or sending anything", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime }, udpApiKey: "alice-key" });
    const worker = new Anime(alice);
    const tasks = [worker.run(task(1), context()), worker.run(task(2), context())];

    const start = performance.now();
    const reported = await status({ dataDir });

    expect(performance.now() - start).toBeLessThan(100);
    expect(reported).toMatchObject({ level: "info", summary: "Logging in to AniDB as alice · 1 queued" });
    expect(detail(reported, "Account")).toBe("alice");
    expect(Date.parse(detail(reported, "Next send") ?? "")).toBeGreaterThan(Date.now() + 3_000);
    await Promise.all(tasks);
    expect(anidb.commands()).toEqual(["ENCRYPT", "AUTH", "ANIME", "ANIME"]);
    expect(JSON.stringify(reported)).not.toMatch(/alice-secret|alice-key/);
  }, 30_000);

  it("reports a logged-in Session, and when it may next send", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    await new Anime({ username: "alice", password: "alice-secret" }).run(task(1), context());

    const reported = await status({});

    expect(reported).toMatchObject({ level: "ok", summary: "Logged in to AniDB as alice · 0 queued" });
    const nextSend = Date.parse(detail(reported, "Next send") ?? "");
    expect(nextSend).toBeGreaterThan(Date.now() + 2_000);
    expect(nextSend).toBeLessThanOrEqual(Date.now() + 4_000);
  }, 30_000);

  it("warns of a Circuit breaker block", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: () => "555 BANNED" }, udpApiKey: "alice-key" });
    await new Anime(alice).run(task(1), context()).catch(() => {});

    const reported = await status({ dataDir });

    expect(reported.level).toBe("warning");
    expect(reported.summary).toMatch(/^AniDB is blocked after a ban: no AniDB Task runs until /);
    expect(Date.parse(detail(reported, "Blocked until") ?? "")).toBeGreaterThan(Date.now() + 29 * 60_000);
  }, 30_000);

  it("warns of a block kept in the Plugin's data directory, after a restart, sending nothing", async () => {
    const until = Date.now() + 10 * 60_000;
    await writeFile(join(dataDir, "anidb-block.json"), JSON.stringify({ until, trips: 1 }));
    anidb = await startFakeAniDB();

    const reported = await status({ dataDir });

    expect(reported.level).toBe("warning");
    expect(detail(reported, "Blocked until")).toBe(new Date(until).toISOString());
    expect(anidb.received).toEqual([]);
  });
});
