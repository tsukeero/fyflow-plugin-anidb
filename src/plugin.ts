// The Plugin's entry. Every Node Type talking to AniDB runs on an inline Session Worker borrowing the Host's one
// Session (ADR-0001); hashing, which never talks to AniDB, runs threaded.
import { CPU_GROUP, DISK_GROUP, definePlugin } from "fyflow-plugin-sdk";
import { FILE_FIELDS } from "./file-fields.ts";
import { SESSION_FIELDS } from "./session.ts";

// Worker modules sit beside this one: TypeScript in the source, JavaScript once built.
const moduleExtension = import.meta.url.endsWith(".ts") ? "ts" : "js";

// A Session Worker's pool: one instance, holding every waiting Task inside its run() so each can say why it waits in
// the Request queue; AniDB's pace, not the pool, limits how fast they go.
const SESSION_POOL = { maxThreads: 1, maxConcurrentTasks: 100 };

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
        // Where AniDB's answers are kept, an absolute path: without one they last only as long as the Session.
        cacheDir: { type: "string", minLength: 1 },
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
    identifyFile: {
      url: `./identify-file.worker.${moduleExtension}`,
      settingsSchema: {
        type: "object",
        properties: {
          // The file fields to get back, as anidb-udp-client names them; the aid, eid and gid always come back.
          fields: { type: "array", items: { type: "string", enum: [...FILE_FIELDS] }, minItems: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  nodeTypes: {
    AniDBAnime: {
      worker: "anime",
      inline: true,
      pool: SESSION_POOL,
      profile: [...SESSION_FIELDS],
      icon: "search",
      description: "Looks an anime up on AniDB by its aid.",
    },
    AniDBIdentifyFile: {
      worker: "identifyFile",
      inline: true,
      pool: SESSION_POOL,
      profile: [...SESSION_FIELDS],
      icon: "search",
      description: "Identifies a hashed file on AniDB by its ed2k and size: its anime, episode and group.",
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
