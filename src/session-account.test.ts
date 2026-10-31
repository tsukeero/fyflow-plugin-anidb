// One account per Host (ADR-0002): the Session is opened with the first Profile's start-up fields, and a Profile
// naming another account waits until it idles out, failing clearly rather than juggling sessions into a ban.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskEnvelope, WorkerContext } from "fyflow-plugin-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeAniDB, startFakeAniDB } from "../test/fake-anidb.ts";
import Anime from "./anime.worker.ts";
import { resetSession } from "./session.ts";

const context = (): WorkerContext => ({ sendProgress: () => {}, signal: new AbortController().signal });
const task = (aid: number): TaskEnvelope<never, never> => ({
  settings: { profile: {} } as never,
  input: { aid } as never,
});
const anime = (params: Record<string, string>) =>
  `230 ANIME\n${params.aid}|1998|TV Series|Anime ${params.aid}|Anime ${params.aid}|26`;

const failure = (promise: Promise<unknown>) =>
  promise.then(
    (result) => result,
    (error: Error) => error.message,
  );

let cacheDir: string;
let alice: { username: string; password: string; udpApiKey: string; cacheDir: string };
let anidb: FakeAniDB | undefined;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "anidb-account-"));
  alice = { username: "alice", password: "alice-secret", udpApiKey: "alice-key", cacheDir };
});

afterEach(async () => {
  await resetSession();
  await anidb?.close();
  anidb = undefined;
  await rm(cacheDir, { recursive: true, force: true });
});

describe("one account per Host", () => {
  it.each([
    ["another account", { username: "bob", password: "bob-secret" }, "username"],
    ["another password", { password: "other-secret" }, "password"],
    ["another UDP API key", { udpApiKey: "other-key" }, "udpApiKey"],
    ["another Cache directory", { cacheDir: join(tmpdir(), "elsewhere") }, "cacheDir"],
  ])(
    "fails a Task whose Profile names %s at once, naming the Session account, sending nothing",
    async (_, other, field) => {
      anidb = await startFakeAniDB({ handlers: { ANIME: anime }, udpApiKey: "alice-key" });
      await new Anime(alice).run(task(1), context());
      const sent = anidb.received.length;

      const message = await failure(new Anime({ ...alice, ...other }).run(task(2), context()));

      expect(message).toContain("held by alice");
      expect(message).toContain(`\`${field}\``);
      expect(message).toMatch(/idles out at \d{4}-\d\d-\d\dT/);
      for (const secret of ["alice-secret", "alice-key", "bob-secret", "other-secret", "other-key"])
        expect(message).not.toContain(secret);
      expect(anidb.received.length).toBe(sent);
    },
    30_000,
  );

  it("lets Profiles with the same Session fields share it, an empty field counting as unset", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const bob = { username: "bob", password: "bob-secret" };

    await new Anime(bob).run(task(1), context());
    await new Anime({ ...bob, udpApiKey: "" }).run(task(2), context());

    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "ANIME"]);
  }, 30_000);

  it("fails a Task from another account while the Session account's Tasks are still queued", async () => {
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const first = new Anime({ username: "alice", password: "alice-secret" }).run(task(1), context());

    const message = await failure(
      new Anime({ username: "bob", password: "bob-secret" }).run(task(2), context()),
    );

    expect(message).toContain("held by alice");
    expect(message).toContain("idles out once its Tasks are done");
    await first;
    expect(anidb.commands()).toEqual(["AUTH", "ANIME"]);
  }, 30_000);

  it("lets the next Profile open the Session with its own fields once it idles out", async () => {
    await resetSession({ idleMs: 300 });
    anidb = await startFakeAniDB({ handlers: { ANIME: anime } });
    const bob = { username: "bob", password: "bob-secret" };
    await new Anime({ username: "alice", password: "alice-secret" }).run(task(1), context());
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(await new Anime(bob).run(task(2), context())).toMatchObject({ found: true });

    expect(anidb.commands()).toEqual(["AUTH", "ANIME", "LOGOUT", "AUTH", "ANIME"]);
    expect(anidb.received[3]?.params).toMatchObject({ user: "bob", pass: "bob-secret" });
  }, 30_000);

  it("lets another Profile open the Session when the first one's login is refused", async () => {
    anidb = await startFakeAniDB({
      handlers: {
        ANIME: anime,
        AUTH: (params) => (params.user === "bob" ? "200 s LOGIN ACCEPTED" : "500 LOGIN FAILED"),
      },
    });

    expect(
      await failure(new Anime({ username: "alice", password: "wrong" }).run(task(1), context())),
    ).toContain("LOGIN_FAILED");
    expect(
      await new Anime({ username: "bob", password: "bob-secret" }).run(task(2), context()),
    ).toMatchObject({
      found: true,
    });
  }, 30_000);
});
