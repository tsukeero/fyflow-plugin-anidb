import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeAniDB, type Handler, startFakeAniDB } from "../test/fake-anidb.ts";
import Anime from "./anime.worker.ts";
import { resetSession } from "./session.ts";

const MINUTE = 60_000;
const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (aid: number): TaskEnvelope<never, never> => ({
  settings: { profile: {} } as never,
  input: { aid } as never,
});
const bebop = "230 ANIME\n1|1998|TV Series|Cowboy Bebop|Cowboy Bebop|26";

/** Answers each request with the next of `replies`, then with the last one. */
const inTurn = (...replies: Array<string | undefined>): Handler => {
  let next = 0;
  return () => replies[Math.min(next++, replies.length - 1)];
};

/** The Task's error message, or the result when it did not fail. */
const failure = (promise: Promise<unknown>) =>
  promise.then(
    (result) => result,
    (error: Error) => error.message,
  );

let cacheDir: string;
let alice: { username: string; password: string; cacheDir: string };
let anidb: FakeAniDB | undefined;
let now: number;
const clock = () => now;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "anidb-breaker-"));
  alice = { username: "alice", password: "secret", cacheDir };
  now = Date.parse("2026-10-31T12:00:00Z");
  await resetSession({ now: clock });
});

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
  await rm(cacheDir, { recursive: true, force: true });
});

describe("an expired AniDB session", () => {
  it.each([["501 LOGIN FIRST"], ["506 INVALID SESSION"]])(
    "on %s, logs in again once and retries the request",
    async (reply) => {
      anidb = await startFakeAniDB({ handlers: { ANIME: inTurn(reply, bebop) } });

      const result = await new Anime(alice).run(task(1), context());

      expect(result).toMatchObject({ found: true, anime: { aid: 1 } });
      expect(anidb.commands()).toEqual(["AUTH", "ANIME", "LOGOUT", "AUTH", "ANIME"]);
      // The new login keeps AniDB's spacing after the old session's end, though its client is new.
      const [, , logout, auth] = anidb.received;
      expect((auth?.at ?? 0) - (logout?.at ?? 0)).toBeGreaterThanOrEqual(3_900);
    },
    30_000,
  );

  it("fails the Task with AniDB's code and label when the retry fails too", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: () => "506 INVALID SESSION" } });

    expect(await failure(new Anime(alice).run(task(1), context()))).toContain("506: INVALID_SESSION");
    expect(anidb.commands().filter((command) => command === "ANIME")).toHaveLength(2);
  }, 30_000);
});

describe("the Circuit breaker", () => {
  it.each([
    ["555 BANNED", "BANNED"],
    ["503 CLIENT VERSION OUTDATED", "CLIENT_VERSION_OUTDATED"],
    ["504 CLIENT BANNED", "CLIENT_BANNED"],
  ])(
    "trips on %s: every AniDB Task fails at once with the block-until time",
    async (reply, label) => {
      anidb = await startFakeAniDB({ handlers: { ANIME: () => reply } });
      const worker = new Anime(alice);

      const first = failure(worker.run(task(1), context()));
      const queued = failure(worker.run(task(2), context()));

      const blocked = "AniDB is blocked until 2026-10-31T12:30:00.000Z";
      expect(await first).toContain(blocked);
      expect(await first).toContain(label);
      expect(await queued).toContain(blocked);
      const sent = anidb.received.length;

      expect(await failure(worker.run(task(3), context()))).toContain(blocked);
      expect(anidb.received.length).toBe(sent);
      expect(anidb.commands().filter((command) => command === "ANIME")).toHaveLength(1);
    },
    30_000,
  );

  it("trips when AniDB bans the login itself", async () => {
    anidb = await startFakeAniDB({ handlers: { AUTH: () => "555 BANNED" } });

    expect(await failure(new Anime(alice).run(task(1), context()))).toContain(
      "AniDB is blocked until 2026-10-31T12:30:00.000Z",
    );
    expect(anidb.commands()).not.toContain("ANIME");
  }, 30_000);

  it("lifts after the block, and blocks twice as long on the next trip", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: inTurn("555 BANNED", bebop, "555 BANNED") } });
    const worker = new Anime(alice);
    await failure(worker.run(task(1), context()));

    now += 31 * MINUTE;
    expect(await worker.run(task(1), context())).toMatchObject({ found: true });
    expect(await failure(worker.run(task(2), context()))).toContain(
      `AniDB is blocked until ${new Date(now + 60 * MINUTE).toISOString()}`,
    );
  }, 30_000);

  it("forgets earlier trips after a clean day", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: inTurn("555 BANNED", "555 BANNED") } });
    const worker = new Anime(alice);
    await failure(worker.run(task(1), context()));

    now += 30 * MINUTE + 25 * 60 * MINUTE;
    expect(await failure(worker.run(task(2), context()))).toContain(
      `AniDB is blocked until ${new Date(now + 30 * MINUTE).toISOString()}`,
    );
  }, 30_000);

  it("keeps the block in the Cache directory, so a new Session is still blocked", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: () => "555 BANNED" } });
    await failure(new Anime(alice).run(task(1), context()));

    await resetSession({ now: clock });
    const sent = anidb.received.length;

    expect(await failure(new Anime(alice).run(task(1), context()))).toContain("AniDB is blocked until");
    expect(anidb.received.length).toBe(sent);
  }, 30_000);

  it("never blocks longer than a day, counting trips kept from before a restart", async () => {
    await writeFile(join(cacheDir, "anidb-block.json"), JSON.stringify({ until: now - MINUTE, trips: 6 }));
    anidb = await startFakeAniDB({ handlers: { ANIME: () => "555 BANNED" } });

    expect(await failure(new Anime(alice).run(task(1), context()))).toContain(
      `AniDB is blocked until ${new Date(now + 24 * 60 * MINUTE).toISOString()}`,
    );
  }, 30_000);

  it("ignores a block file it cannot read", async () => {
    await writeFile(join(cacheDir, "anidb-block.json"), "not json");
    anidb = await startFakeAniDB({ handlers: { ANIME: () => bebop } });

    expect(await new Anime(alice).run(task(1), context())).toMatchObject({ found: true });
  }, 30_000);

  it("keeps the block in memory only without a Cache directory", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: inTurn("555 BANNED", bebop) } });
    const bob = { username: "bob", password: "secret" };
    await failure(new Anime(bob).run(task(1), context()));

    await resetSession({ now: clock });

    expect(await new Anime(bob).run(task(1), context())).toMatchObject({ found: true });
  }, 30_000);

  it("trips on a run of timeouts", async () => {
    await resetSession({ now: clock, timeoutsToTrip: 2 });
    anidb = await startFakeAniDB({ handlers: { ANIME: () => undefined } });
    const worker = new Anime(alice);

    expect(await failure(worker.run(task(1), context()))).not.toContain("blocked");
    expect(await failure(worker.run(task(1), context()))).toContain("AniDB is blocked until");
  }, 90_000);

  it("fails the Task on any other AniDB error, keeping the Session as it is", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: inTurn("598 UNKNOWN COMMAND", bebop) } });
    const worker = new Anime(alice);

    expect(await failure(worker.run(task(1), context()))).toContain("598: UNKNOWN_COMMAND");
    expect(await worker.run(task(1), context())).toMatchObject({ found: true });
    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "ANIME"]);
  }, 30_000);
});
