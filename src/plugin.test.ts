import type { JsonSchema } from "fyflow-plugin-sdk";
import { describe, expect, it } from "vitest";
import Anime from "./anime.worker.ts";
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
    expect(anime?.description).toEqual(expect.any(String));

    const worker = plugin.workers?.[anime?.worker ?? ""];
    const module = await import(new URL(worker?.url ?? "", plugin.base).href);
    expect(module.default).toBe(Anime);
  });
});
