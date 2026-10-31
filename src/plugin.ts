// The Plugin's entry. Every Node Type talking to AniDB runs on an inline Session Worker borrowing the Host's one
// Session (ADR-0001); hashing, which never talks to AniDB, runs threaded.
import { CPU_GROUP, DISK_GROUP, definePlugin } from "fyflow-plugin-sdk";
import { SESSION_FIELDS } from "./session.ts";

// Worker modules sit beside this one: TypeScript in the source, JavaScript once built.
const moduleExtension = import.meta.url.endsWith(".ts") ? "ts" : "js";

export default definePlugin({
  id: "anidb",
  version: "0.0.0",
  base: import.meta.url,
  profile: {
    schema: {
      type: "object",
      properties: {
        username: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1, writeOnly: true },
        // The account's UDP API Key, from its AniDB profile: with one, the Session is encrypted.
        udpApiKey: { type: "string", minLength: 1, writeOnly: true },
        // The folders AniDBHashFile may read under (ADR-0005): a grant only a Profile may set.
        roots: { type: "array", items: { type: "string", minLength: 1 } },
      },
      additionalProperties: false,
    },
    startup: [...SESSION_FIELDS],
    profileOnly: ["roots"],
  },
  workers: {
    anime: { url: `./anime.worker.${moduleExtension}` },
    hashFile: { url: `./hash-file.worker.${moduleExtension}` },
  },
  nodeTypes: {
    AniDBAnime: {
      worker: "anime",
      inline: true,
      profile: [...SESSION_FIELDS],
      icon: "search",
      description: "Looks an anime up on AniDB by its aid.",
    },
    AniDBHashFile: {
      worker: "hashFile",
      profile: ["roots"],
      groups: [DISK_GROUP, CPU_GROUP],
      icon: "hash",
      description: "Computes a file's ed2k hash, which AniDB identifies files by.",
    },
  },
});
