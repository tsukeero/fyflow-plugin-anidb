import type { JsonSchema } from "fyflow-plugin-sdk";
import { describe, expect, it } from "vitest";
import Anime from "./anime.worker.ts";
import Episode from "./episode.worker.ts";
import HashFile from "./hash-file.worker.ts";
import IdentifyFile from "./identify-file.worker.ts";
import MyListAdd from "./mylist-add.worker.ts";
import MyListGet from "./mylist-get.worker.ts";
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

  it("sets the Cache directory on the Profile, read when the Session logs in", () => {
    expect(property("cacheDir")).toMatchObject({ type: "string" });
    expect(property("cacheDir")?.writeOnly).toBeUndefined();
    expect(plugin.profile?.startup).toContain("cacheDir");
  });

  it("contributes AniDBAnime as an inline Session Worker taking the account fields", async () => {
    const anime = plugin.nodeTypes?.AniDBAnime;
    expect(anime).toMatchObject({ inline: true, profile: ["username", "password", "udpApiKey", "cacheDir"] });
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

  it("contributes AniDBIdentifyFile as an inline Session Worker whose fields a Flow may choose", async () => {
    const identify = plugin.nodeTypes?.AniDBIdentifyFile;
    expect(identify).toMatchObject({
      inline: true,
      profile: ["username", "password", "udpApiKey", "cacheDir"],
    });
    expect(identify?.pool).toEqual({ maxThreads: 1, maxConcurrentTasks: 100 });
    expect(identify?.description).toEqual(expect.any(String));

    const worker = plugin.workers?.[identify?.worker ?? ""];
    expect(worker?.settingsSchema).toMatchObject({
      properties: {
        fields: { type: "array", items: { enum: expect.arrayContaining(["romanji_name", "epno"]) } },
      },
    });
    const module = await import(new URL(worker?.url ?? "", plugin.base).href);
    expect(module.default).toBe(IdentifyFile);
  });

  it.each([
    ["AniDBMyListGet", MyListGet],
    ["AniDBMyListAdd", MyListAdd],
    ["AniDBEpisode", Episode],
  ])("contributes %s as an inline Session Worker", async (name, Worker) => {
    const nodeType = plugin.nodeTypes?.[name];
    expect(nodeType).toMatchObject({
      inline: true,
      profile: ["username", "password", "udpApiKey", "cacheDir"],
    });
    expect(nodeType?.pool).toEqual({ maxThreads: 1, maxConcurrentTasks: 100 });
    expect(nodeType?.description).toEqual(expect.any(String));

    const worker = plugin.workers?.[nodeType?.worker ?? ""];
    const module = await import(new URL(worker?.url ?? "", plugin.base).href);
    expect(module.default).toBe(Worker);
  });

  it("lets a Flow set AniDBMyListAdd's entry values and `edit`", () => {
    const worker = plugin.workers?.[plugin.nodeTypes?.AniDBMyListAdd?.worker ?? ""];
    expect(worker?.settingsSchema).toMatchObject({
      properties: {
        edit: { type: "boolean" },
        state: { enum: expect.arrayContaining(["internal_storage", "deleted"]) },
        viewed: { type: "boolean" },
        viewdate: { type: "integer" },
      },
    });
  });

  it("lets a Flow choose AniDBAnime's fields", () => {
    const worker = plugin.workers?.[plugin.nodeTypes?.AniDBAnime?.worker ?? ""];
    expect(worker?.settingsSchema).toMatchObject({
      properties: {
        fields: { type: "array", items: { enum: expect.arrayContaining(["romanji_name", "episodes"]) } },
      },
    });
  });
});
