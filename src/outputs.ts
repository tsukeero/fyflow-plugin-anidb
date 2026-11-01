// What each Node Type's Task returns, as JSON Schema in fyflow's subset: the editor suggests an Edge condition's paths
// from it (`found`, `anime.aid`), and a person marking a failed Task done fills it in. It types what every result
// carries, the outcome and the ids, and leaves the rest open: the fields a Flow asks AniDB for vary, and AniDB answers
// some as text and some as numbers. The AniDB Node Types return their input too, so other fields are allowed. The
// subset has no `anyOf`, so a part only one outcome carries (`anime` when found) is optional, and an example shows
// each outcome.
import { MYLIST_STATES } from "./mylist-settings.ts";

const id = (what: string) => ({ type: "integer", minimum: 1, description: what }) as const;

const found = {
  type: "boolean",
  description: "Whether AniDB knows it: false when AniDB answers that there is no such thing.",
} as const;

/** One part of an answer: an object holding its id, and whatever fields the Flow asked for. */
const part = (description: string, idName: string, idWhat: string) =>
  ({
    type: "object",
    description,
    properties: { [idName]: id(idWhat) },
    required: [idName],
  }) as const;

const ed2k = "fc21d9af828f92a8df64beac3357425d";

export const HASH_FILE_OUTPUT = {
  type: "object",
  description: "The file's ed2k hash and size, beside the path it was read from.",
  properties: {
    path: { type: "string", description: "The path the input gave." },
    size: { type: "integer", minimum: 0, description: "The file's size in bytes." },
    ed2k: {
      type: "string",
      minLength: 32,
      maxLength: 32,
      description: "The file's ed2k hash, 32 lower-case hexadecimal characters.",
    },
  },
  required: ["path", "size", "ed2k"],
  examples: [{ path: "D:\\Anime\\Cowboy Bebop\\01.mkv", size: 9_728_000, ed2k }],
} as const;

export const IDENTIFY_FILE_OUTPUT = {
  type: "object",
  description:
    "The input, with `found`; when found, the file, its anime, episode and group, each holding its id and the `fields` the Node asks for.",
  properties: {
    found,
    file: {
      ...part("The file.", "fid", "The file's AniDB id."),
      properties: {
        fid: id("The file's AniDB id."),
        version: {
          type: "integer",
          minimum: 1,
          description: "The release's version, 1 to 5, when the Node asks for `state`.",
        },
        crc_ok: {
          type: "boolean",
          description: "The file's CRC32 matches the official one, when the Node asks for `state`.",
        },
        crc_err: {
          type: "boolean",
          description: "The file's CRC32 does not match the official one, when the Node asks for `state`.",
        },
        censored: {
          type: "boolean",
          description: "AniDB flags the file censored, when the Node asks for `state`.",
        },
        uncensored: {
          type: "boolean",
          description:
            "AniDB flags the file uncensored, when the Node asks for `state`. Neither flag set: AniDB does not know.",
        },
      },
    },
    anime: part("The file's anime.", "aid", "The anime's AniDB id."),
    episode: part("The file's episode.", "eid", "The episode's AniDB id."),
    group: part("The group that released the file.", "gid", "The group's AniDB id."),
  },
  required: ["found"],
  examples: [
    {
      ed2k,
      size: 9_728_000,
      found: true,
      file: {
        fid: 312498,
        state: "9",
        version: 3,
        crc_ok: true,
        crc_err: false,
        censored: false,
        uncensored: false,
        crc32: "a1b2c3d4",
      },
      anime: { aid: 1, romanji_name: "Cowboy Bebop", english_name: "Cowboy Bebop" },
      episode: { eid: 10, epno: "01", ep_name: "Asteroid Blues" },
      group: { gid: 7, group_short_name: "GRP" },
    },
    { ed2k, size: 9_728_000, found: false },
  ],
} as const;

export const ANIME_OUTPUT = {
  type: "object",
  description:
    "The input, with `found`; when found, the anime: its `aid` and the `fields` the Node asks for.",
  properties: { found, anime: part("The anime.", "aid", "The anime's AniDB id.") },
  required: ["found"],
  examples: [
    {
      aid: 1,
      found: true,
      anime: { aid: 1, year: "1998", type: "TV Series", romanji_name: "Cowboy Bebop", episodes: 26 },
    },
    { title: "No Such Anime", found: false },
  ],
} as const;

export const EPISODE_OUTPUT = {
  type: "object",
  description: "The input, with `found`; when found, the episode as AniDB describes it.",
  properties: {
    found,
    episode: {
      ...part("The episode.", "eid", "The episode's AniDB id."),
      properties: {
        eid: id("The episode's AniDB id."),
        aid: id("Its anime's AniDB id."),
        epno: { type: "string", description: "Its number in the anime: 1, or S1 for a special, and so on." },
        length: { type: "integer", minimum: 0, description: "Its length in minutes." },
        eng: { type: "string", description: "Its English title." },
        romaji: { type: "string", description: "Its title in romaji." },
        kanji: { type: "string", description: "Its title in kanji." },
        aired: { type: "integer", description: "When it first aired, in seconds since 1970." },
        type: {
          type: "string",
          enum: ["", "S", "C", "T", "P", "O"],
          description: "Its kind: empty for a regular episode, else S, C, T, P or O, as `epno` begins.",
        },
      },
      required: ["eid", "aid", "epno"],
    },
  },
  required: ["found"],
  examples: [
    {
      eid: 10,
      found: true,
      episode: {
        eid: 10,
        aid: 1,
        length: 25,
        rating: 850,
        votes: 12,
        epno: "1",
        eng: "Asteroid Blues",
        romaji: "Asteroid Blues",
        kanji: "Asteroid Blues",
        aired: 909619200,
        type: "",
      },
    },
    { aid: 1, epno: "S9", found: false },
  ],
} as const;

const entryExample = {
  lid: 9001,
  fid: 312498,
  eid: 10,
  aid: 1,
  gid: 7,
  date: 1700000000,
  state: "internal_storage",
  viewdate: 1700001000,
  storage: "shelf",
  source: "ed2k",
  other: "",
  filestate: "normal/original",
};

/** A MyList entry, as AniDB keeps it. */
const entry = {
  type: "object",
  description: "The file's MyList entry.",
  properties: {
    lid: id("The entry's AniDB id."),
    fid: id("Its file's AniDB id."),
    eid: id("Its episode's AniDB id."),
    aid: id("Its anime's AniDB id."),
    gid: { type: "integer", minimum: 0, description: "Its group's AniDB id; 0 for none." },
    state: { type: "string", enum: [...MYLIST_STATES], description: "Where the file is." },
    viewdate: {
      type: "integer",
      minimum: 0,
      description: "When it was watched, in seconds since 1970; 0 when it was not.",
    },
    storage: { type: "string" },
    source: { type: "string" },
    other: { type: "string" },
  },
  required: ["lid", "fid"],
} as const;

export const MYLIST_GET_OUTPUT = {
  type: "object",
  description: "The input, with `found`: whether the file is in MyList; when it is, its `entry`.",
  properties: {
    found: { type: "boolean", description: "Whether the file is in MyList." },
    entry,
  },
  required: ["found"],
  examples: [
    { fid: 312498, found: true, entry: entryExample },
    { fid: 5, found: false },
  ],
} as const;

export const MYLIST_ADD_OUTPUT = {
  type: "object",
  description:
    "The input, with `added`: true when the file was added. Otherwise the file was already in MyList (its `lid`, and its `entry` left as it is, or `edited: true` when the Node sets `edit`), or AniDB does not know it (`found: false`).",
  properties: {
    added: { type: "boolean", description: "Whether this Task added the file to MyList." },
    lid: id("The file's MyList entry."),
    edited: { type: "boolean", description: "True when the Node sets `edit` and the entry was updated." },
    found: {
      type: "boolean",
      description: "False when AniDB does not know the file, or the entry left MyList.",
    },
    entry,
  },
  required: ["added"],
  examples: [
    { fid: 312498, added: true, lid: 9002 },
    { fid: 312498, added: false, lid: 9001, entry: entryExample },
    { fid: 312498, added: false, edited: true, lid: 9001 },
    { ed2k, size: 9_728_000, added: false, found: false },
  ],
} as const;
