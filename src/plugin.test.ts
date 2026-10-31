import type { JsonSchema } from "fyflow-plugin-sdk";
import { describe, expect, it } from "vitest";
import Anime from "./anime.worker.ts";
import HashFile from "./hash-file.worker.ts";
import plugin from "./plugin.ts";

type Schema = { properties?: Record<string, JsonSchema & { writeOnly?: boolean }> };
const property = (name: string) => (plugin.profile?.schema as Schema | undefined)?.properties?.[name];

describe("the Plugin", () => {
  it("declares the AniDB account on the Profile, with the password and UDP API key as secrets", () => {
    expect(plugin.id).toBe("anidb");
    expect(property("username")).toMatchObject({ type: "string" });
    expect(property("username")?.writeOnly).toBeUndefined();
    expect(property("password")).toMatchObject({ type: "string", writeOnly: true });
    expect(property("udpApiKey")).toMatchObject({ type: "string", writeOnly: true });
    expect(plugin.profile?.startup).toEqual(expect.arrayContaining(["username", "password", "udpApiKey"]));
  });

  it("contributes AniDBAnime as an inline Session Worker taking the account fields", async () => {
    const anime = plugin.nodeTypes?.AniDBAnime;
    expect(anime).toMatchObject({ inline: true, profile: ["username", "password", "udpApiKey"] });
    // One instance per pool, holding every waiting Task inside run() so each can say why it waits.
    expect(anime?.pool).toEqual({ maxThreads: 1, maxConcurrentTasks: 100 });
    expect(anime?.description).toEqual(expect.any(String));

    const worker = plugin.workers?.[anime?.worker ?? ""];
    const module = await import(new URL(worker?.url ?? "", plugin.base).href);
    expect(module.default).toBe(Anime);
  });

  it("grants Roots on the Profile only, per Task", () => {
    expect(property("roots")).toMatchObject({ type: "array", items: { type: "string" } });
    expect(plugin.profile?.profileOnly).toEqual(["roots"]);
    expect(plugin.profile?.startup).not.toContain("roots");
  });

  it("contributes AniDBHashFile as a threaded Worker in the disk and cpu groups, taking the Roots", async () => {
    const hash = plugin.nodeTypes?.AniDBHashFile;
    expect(hash).toMatchObject({ profile: ["roots"], groups: ["disk", "cpu"] });
    expect(hash?.inline).not.toBe(true);
    expect(hash?.description).toEqual(expect.any(String));

    const worker = plugin.workers?.[hash?.worker ?? ""];
    const module = await import(new URL(worker?.url ?? "", plugin.base).href);
    expect(module.default).toBe(HashFile);
  });
});
