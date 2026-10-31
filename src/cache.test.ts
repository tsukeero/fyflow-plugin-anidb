// The Cache's lifetimes (ADR-0004): pure logic over a clock, so tested directly; persistence is tested through the
// Session Workers.
import { describe, expect, it } from "vitest";
import { Cache } from "./cache.ts";

const DAY = 24 * 60 * 60_000;

const at = (start: number) => {
  const clock = { now: start };
  return { clock, cache: new Cache(undefined, () => clock.now) };
};

describe("the Cache", () => {
  it.each([
    ["anime", "ANIME:1", 7],
    ["an anime alias", "ANIME:Cowboy Bebop", 7],
    ["episodes", "EPISODE:5", 7],
    ["groups", "GROUP:7", 7],
    ["files", "FILE:s1000|habc", 30],
    ["Not found answers", "NOTFOUND:FILE:s1000|habc", 1],
  ])("keeps %s for %i days", async (_what, key, days) => {
    const { clock, cache } = at(1_000);
    await cache.set(key, { value: 1 });

    clock.now += days * DAY - 1;
    expect(await cache.get(key)).toEqual({ value: 1 });
    clock.now += 1;
    expect(await cache.get(key)).toBeUndefined();
  });

  it("keeps a widened answer only as long as the answer it widened", async () => {
    const { clock, cache } = at(1_000);
    await cache.set("ANIME:1", { aid: 1 });

    clock.now += 6 * DAY;
    await cache.set("ANIME:1", { aid: 1, year: "1998" });
    clock.now += DAY;

    expect(await cache.get("ANIME:1")).toBeUndefined();
  });

  it("answers nothing, and keeps nothing, once closed", async () => {
    const { cache } = at(1_000);
    await cache.set("ANIME:1", { aid: 1 });
    cache.close();

    await cache.set("ANIME:2", { aid: 2 });
    expect(await cache.get("ANIME:1")).toBeUndefined();
    cache.close();
  });

  it("never keeps MyList answers", async () => {
    const { cache } = at(1_000);
    await cache.set("MYLIST:5", { lid: 5 });

    expect(await cache.get("MYLIST:5")).toBeUndefined();
  });

  it("keeps strings, as the library's aliases are", async () => {
    const { cache } = at(1_000);
    await cache.set("ANIME:bebop", "ALIASOF:1");

    expect(await cache.get("ANIME:bebop")).toBe("ALIASOF:1");
  });
});
