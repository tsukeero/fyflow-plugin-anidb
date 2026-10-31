// The Session as Tasks see it: every Session Worker borrows it, whatever its Node Type or Profile, and waits its
// turn in the Request queue (ADR-0001).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import Anime from "./anime.worker.ts";
import { resetSession, session } from "./session.ts";

let cacheDir: string;
let alice: { username: string; password: string; cacheDir: string };

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "anidb-cache-"));
  alice = { username: "alice", password: "secret", cacheDir };
});
const task = (aid: number): TaskEnvelope<object, { aid: number }> => ({
  settings: { profile: {} },
  input: { aid },
});

const anime = (params: Record<string, string>) =>
  `230 ANIME\n${params.aid}|1998|TV Series|Anime ${params.aid}|Anime ${params.aid}|26`;

/** A Task's context, recording its progress messages. */
const context = (signal = new AbortController().signal) => {
  const messages: string[] = [];
  const value: WorkerContext = {
    sendProgress: (_fraction, message) => {
      if (message !== undefined) messages.push(message);
    },
    signal,
  };
  return { messages, value };
};

const settle = (promise: Promise<unknown>) =>
  promise.then(
    () => "done",
    (error: Error) => error.message,
  );

const elapsed = async (promise: Promise<unknown>) => {
  const start = performance.now();
  await promise;
  return performance.now() - start;
};

let anidb: FakeAniDB | undefined;

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
  await rm(cacheDir, { recursive: true, force: true });
});

describe("the Session", () => {
  it("is shared by Worker instances of different pools: one login for all their Tasks", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const defaultProfile = new Anime(alice);
    const otherProfile = new Anime({ ...alice });

    await Promise.all([
      defaultProfile.run(task(1), context().value),
      otherProfile.run(task(2), context().value),
    ]);

    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "ANIME"]);
  }, 20_000);

  it("is the same Session when its module is imported again, as after a Reload", async () => {
    const again = await import(
      /* @vite-ignore */ new URL(`./session.ts?reload=${Date.now()}`, import.meta.url).href
    );

    expect(again.session()).toBe(session());
  });

  it("sends one request at a time, in arrival order, no faster than one every 4 seconds", async () => {
    const sentAt: number[] = [];
    anidb = await startFakeAniDB({
      handlers: {
        ANIME: (params) => {
          sentAt.push(performance.now());
          return anime(params);
        },
      },
    });
    const worker = new Anime(alice);

    const results = await Promise.all([
      worker.run(task(1), context().value),
      worker.run(task(2), context().value),
    ]);

    expect(results.map((r) => r.anime.aid)).toEqual([1, 2]);
    expect(anidb.received.filter((r) => r.command === "ANIME").map((r) => r.params.aid)).toEqual(["1", "2"]);
    expect((sentAt[1] ?? 0) - (sentAt[0] ?? 0)).toBeGreaterThanOrEqual(3_900);
  }, 20_000);

  it("tells each waiting Task its place, its expected wait and the Session account, as the queue moves", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);
    const [first, second, third] = [context(), context(), context()];

    await Promise.all([
      worker.run(task(1), first.value),
      worker.run(task(2), second.value),
      worker.run(task(3), third.value),
    ]);

    expect(first.messages).toEqual(["Asking AniDB as alice"]);
    expect(second.messages).toEqual(["Queued #1 for AniDB as alice, about 4 s", "Asking AniDB as alice"]);
    expect(third.messages).toEqual([
      "Queued #2 for AniDB as alice, about 8 s",
      "Queued #1 for AniDB as alice, about 4 s",
      "Asking AniDB as alice",
    ]);
  }, 30_000);

  it("ends a Task Cancelled while queued at once, sending nothing for it", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);
    const running = worker.run(task(1), context().value);
    const controller = new AbortController();
    const queued = settle(worker.run(task(2), context(controller.signal).value));

    controller.abort(new Error("Cancelled"));

    expect(await elapsed(queued)).toBeLessThan(100);
    expect(await queued).toBe("Cancelled");
    await running;
    expect(anidb.received.filter((r) => r.command === "ANIME").map((r) => r.params.aid)).toEqual(["1"]);
  }, 20_000);

  it("ends a Run of 50 queued Tasks at once when it is Cancelled, sending nothing for any of them", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);
    const running = worker.run(task(1), context().value);
    const run = new AbortController();
    const queued = Array.from({ length: 50 }, (_, i) =>
      settle(worker.run(task(i + 2), context(run.signal).value)),
    );

    run.abort(new Error("Run cancelled"));

    expect(await elapsed(Promise.all(queued))).toBeLessThan(100);
    expect(new Set(await Promise.all(queued))).toEqual(new Set(["Run cancelled"]));
    await running;
    expect(anidb.received.filter((r) => r.command === "ANIME")).toHaveLength(1);
  }, 20_000);

  it("ends a Task Cancelled while its request is out at once, and goes on with the next", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);
    const controller = new AbortController();
    const out = settle(worker.run(task(1), context(controller.signal).value));
    const next = worker.run(task(2), context().value);
    // Its request waits on the library's spacing after the login: cancel it then.
    await new Promise((resolve) => setTimeout(resolve, 500));

    controller.abort(new Error("Cancelled"));

    expect(await elapsed(out)).toBeLessThan(100);
    expect(await out).toBe("Cancelled");
    expect((await next).anime.aid).toBe(2);
  }, 30_000);

  it("logs out once no Task has asked anything for its idle time, and logs in again for the next", async () => {
    await resetSession({ idleMs: 300 });
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);

    await worker.run(task(1), context().value);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "LOGOUT"]);

    await worker.run(task(2), context().value);
    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "LOGOUT", "AUTH", "ANIME"]);
  }, 20_000);

  it("fails a Task whose login is refused, and logs in again for the next", async () => {
    let logins = 0;
    anidb = await startFakeAniDB({
      handlers: {
        ANIME: anime,
        AUTH: () => (++logins === 1 ? "500 LOGIN FAILED" : "200 fakesession LOGIN ACCEPTED"),
      },
    });
    const worker = new Anime(alice);

    expect(await settle(worker.run(task(1), context().value))).toContain("LOGIN_FAILED");
    expect((await worker.run(task(2), context().value)).anime.aid).toBe(2);
  }, 20_000);

  it("finishes logging out before a request arriving meanwhile logs in again", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);
    await worker.run(task(1), context().value);

    const loggingOut = session().shutdown();
    const next = worker.run(task(2), context().value);
    await loggingOut;
    await next;

    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "LOGOUT", "AUTH", "ANIME"]);
  }, 20_000);

  it("rejects the request out when it is shut down", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);
    const out = settle(worker.run(task(1), context().value));
    await new Promise((resolve) => setTimeout(resolve, 500));

    await session().shutdown();

    expect(await out).toContain("shut down");
  }, 20_000);

  it("rejects every queued request when it is shut down", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);
    const running = settle(worker.run(task(1), context().value));
    const queued = settle(worker.run(task(2), context().value));

    await session().shutdown();

    expect(await queued).toContain("shut down");
    await running;
  }, 20_000);
});

describe("the Cache directory", () => {
  it("keeps answers across Sessions: asked again, they come from the Cache, not AniDB", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    await new Anime(alice).run(task(1), context().value);

    await resetSession();
    const again = await new Anime(alice).run(task(1), context().value);

    expect(again.anime.aid).toBe(1);
    // A cached answer still costs a login: the library reads its cache only through a logged-in client.
    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "LOGOUT", "AUTH"]);
  }, 20_000);

  it("asks AniDB again once an answer's lifetime has passed", async () => {
    const clock = { now: Date.now() };
    await resetSession({ now: () => clock.now });
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime(alice);
    await worker.run(task(1), context().value);

    clock.now += 7 * 24 * 60 * 60_000;
    await worker.run(task(1), context().value);

    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "ANIME"]);
  }, 20_000);

  it("without one, keeps answers in memory for the Session's life, saying they will not persist", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const worker = new Anime({ username: "alice", password: "secret" });
    const first = context();

    await worker.run(task(1), first.value);
    await worker.run(task(1), context().value);

    expect(anidb.commands()).toEqual(["AUTH", "ANIME"]);
    expect(first.messages).toContain("AniDB answers will not persist: set `cacheDir` on this Task's Profile");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("will not persist"));
    warn.mockRestore();
  }, 20_000);

  it("fails the Task when it is not an absolute path", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });

    const result = settle(new Anime({ ...alice, cacheDir: "cache" }).run(task(1), context().value));

    expect(await result).toContain("`cacheDir`");
    expect(anidb.received).toEqual([]);
  });

  it("fails the Task when it cannot be created", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const file = join(cacheDir, "a-file");
    await writeFile(file, "");

    const result = settle(
      new Anime({ ...alice, cacheDir: join(file, "cache") }).run(task(1), context().value),
    );

    expect(await result).toContain("`cacheDir`");
    expect(anidb.received).toEqual([]);
  });
});
