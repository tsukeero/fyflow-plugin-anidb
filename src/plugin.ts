// The Plugin's entry. Every Node Type talking to AniDB runs on an inline Session Worker borrowing the Host's one
// Session (ADR-0001); hashing, which never talks to AniDB, runs threaded. The Plugin's status reports the Session.
import { CPU_GROUP, DISK_GROUP, definePlugin } from "fyflow-plugin-sdk";
import { ANIME_FIELDS, FILE_FIELDS, fieldsSchema } from "./fields.ts";
import {
  ANIME_INPUT,
  EPISODE_INPUT,
  HASH_FILE_INPUT,
  IDENTIFY_FILE_INPUT,
  MYLIST_ADD_INPUT,
  MYLIST_GET_INPUT,
} from "./inputs.ts";
import { MYLIST_SETTINGS_SCHEMA } from "./mylist-settings.ts";
import {
  ANIME_OUTPUT,
  EPISODE_OUTPUT,
  HASH_FILE_OUTPUT,
  IDENTIFY_FILE_OUTPUT,
  MYLIST_ADD_OUTPUT,
  MYLIST_GET_OUTPUT,
} from "./outputs.ts";
import { SESSION_FIELDS } from "./session.ts";
import { status } from "./status.ts";

// Worker modules sit beside this one: TypeScript in the source, JavaScript once built.
const moduleExtension = import.meta.url.endsWith(".ts") ? "ts" : "js";

// A Session Worker's pool: one instance, holding every waiting Task inside its run() so each can say why it waits in
// the Request queue; AniDB's pace, not the pool, limits how fast they go.
const SESSION_POOL = { maxThreads: 1, maxConcurrentTasks: 100 };

export default definePlugin({
  id: "fyflow-ext.anidb",
  version: "0.0.4",
  base: import.meta.url,
  // The Cache and the Circuit breaker's block are kept in the Host's data directory for this Plugin (ADR-0004).
  dataDir: true,
  status,
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
    anime: {
      url: `./anime.worker.${moduleExtension}`,
      settingsSchema: fieldsSchema(ANIME_FIELDS),
      inputSchema: ANIME_INPUT,
      outputSchema: ANIME_OUTPUT,
    },
    episode: {
      url: `./episode.worker.${moduleExtension}`,
      inputSchema: EPISODE_INPUT,
      outputSchema: EPISODE_OUTPUT,
    },
    hashFile: {
      url: `./hash-file.worker.${moduleExtension}`,
      inputSchema: HASH_FILE_INPUT,
      outputSchema: HASH_FILE_OUTPUT,
    },
    identifyFile: {
      url: `./identify-file.worker.${moduleExtension}`,
      settingsSchema: fieldsSchema(FILE_FIELDS),
      inputSchema: IDENTIFY_FILE_INPUT,
      outputSchema: IDENTIFY_FILE_OUTPUT,
    },
    myListGet: {
      url: `./mylist-get.worker.${moduleExtension}`,
      inputSchema: MYLIST_GET_INPUT,
      outputSchema: MYLIST_GET_OUTPUT,
    },
    myListAdd: {
      url: `./mylist-add.worker.${moduleExtension}`,
      settingsSchema: MYLIST_SETTINGS_SCHEMA,
      inputSchema: MYLIST_ADD_INPUT,
      outputSchema: MYLIST_ADD_OUTPUT,
    },
  },
  nodeTypes: {
    AniDBAnime: {
      worker: "anime",
      inline: true,
      pool: SESSION_POOL,
      profile: [...SESSION_FIELDS],
      icon: "search",
      description: "Looks an anime up on AniDB by its aid or any of its titles.",
    },
    AniDBEpisode: {
      worker: "episode",
      inline: true,
      pool: SESSION_POOL,
      profile: [...SESSION_FIELDS],
      icon: "play",
      description: "Looks an episode up on AniDB by its eid, or by its anime's aid and its episode number.",
    },
    AniDBIdentifyFile: {
      worker: "identifyFile",
      inline: true,
      pool: SESSION_POOL,
      profile: [...SESSION_FIELDS],
      icon: "search",
      description: "Identifies a hashed file on AniDB by its ed2k and size: its anime, episode and group.",
    },
    AniDBMyListGet: {
      worker: "myListGet",
      inline: true,
      pool: SESSION_POOL,
      profile: [...SESSION_FIELDS],
      icon: "list",
      description: "Gets a file's MyList entry, by fid or by ed2k and size; never from the Cache.",
    },
    AniDBMyListAdd: {
      worker: "myListAdd",
      inline: true,
      pool: SESSION_POOL,
      profile: [...SESSION_FIELDS],
      icon: "check",
      description:
        "Adds a file to MyList, by fid or by ed2k and size, leaving an entry already there as it is unless `edit` is set.",
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
