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
    { fid: 5, found: false },
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

/** A title as the HTTP API gives it. */
const httpTitle = {
  type: "object",
  properties: {
    title: { type: "string" },
    lang: {
      type: "string",
      description: "Its language, as AniDB's code: x-jat for romaji, en, ja and so on.",
    },
    type: {
      type: "string",
      description: "main, official, synonym, short, kana or card; none on an episode's title.",
    },
  },
  required: ["title", "lang"],
} as const;

/** A rating as the HTTP API gives it: on AniDB's scale of 1 to 10, with its number of votes. */
const httpRating = {
  type: "object",
  properties: { value: { type: "number" }, count: { type: "integer", minimum: 0 } },
  required: ["value", "count"],
} as const;

/** A date as the HTTP API gives it. */
const httpDate = (what: string) => ({ type: "string", description: `${what}, as yyyy-mm-dd.` }) as const;

export const HTTP_ANIME_OUTPUT = {
  type: "object",
  description:
    "The input, with `found`; when found, the anime as AniDB's HTTP API describes it, in anidb-udp-client's shape: its titles, ratings, tags, creators, characters, episodes, and related and similar anime.",
  properties: {
    found,
    anime: {
      type: "object",
      description: "The anime.",
      properties: {
        aid: id("The anime's AniDB id."),
        restricted: { type: "boolean", description: "Whether AniDB marks it 18+." },
        type: { type: "string", description: "TV Series, OVA, Movie, Web and so on." },
        episode_count: { type: "integer", minimum: 0, description: "How many regular episodes it has." },
        start_date: httpDate("When it started"),
        end_date: httpDate("When it ended"),
        titles: { type: "array", items: httpTitle },
        description: { type: "string" },
        url: { type: "string", description: "Its official website." },
        picture: { type: "string", description: "Its picture's file name on AniDB's image server." },
        ratings: {
          type: "object",
          properties: {
            permanent: httpRating,
            mean: { ...httpRating, description: "The mean of all votes, which AniDB calls temporary." },
            review: httpRating,
          },
        },
        tags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: id("The tag's AniDB id."),
              name: { type: "string" },
              weight: { type: "integer", minimum: 0, description: "How much it applies, 0 to 600." },
              local_spoiler: { type: "boolean" },
              global_spoiler: { type: "boolean" },
            },
            required: ["id", "name"],
          },
        },
        creators: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: id("The creator's AniDB id."),
              name: { type: "string" },
              type: {
                type: "string",
                description: "Their part: Direction, Music, Animation Work and so on.",
              },
            },
            required: ["id", "name", "type"],
          },
        },
        episodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: id("The episode's AniDB id."),
              epno: {
                type: "object",
                properties: {
                  type: {
                    type: "integer",
                    minimum: 1,
                    maximum: 6,
                    description: "1 regular, 2 special, 3 credit, 4 trailer, 5 parody, 6 other.",
                  },
                  value: { type: "string", description: "Its number: 1, or S1 for a special, and so on." },
                },
                required: ["type", "value"],
              },
              length: { type: "integer", minimum: 0, description: "Its length in minutes." },
              air_date: httpDate("When it first aired"),
              titles: { type: "array", items: httpTitle },
            },
            required: ["id", "epno"],
          },
        },
        related_anime: {
          type: "array",
          items: {
            type: "object",
            properties: {
              aid: id("The related anime's AniDB id."),
              type: { type: "string" },
              title: { type: "string" },
            },
            required: ["aid"],
          },
        },
        similar_anime: {
          type: "array",
          items: {
            type: "object",
            properties: { aid: id("The similar anime's AniDB id."), title: { type: "string" } },
            required: ["aid"],
          },
        },
        characters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: id("The character's AniDB id."),
              name: { type: "string" },
              type: { type: "string" },
            },
            required: ["id", "name"],
          },
        },
      },
      required: ["aid"],
    },
  },
  required: ["found"],
  examples: [
    {
      aid: 6107,
      found: true,
      anime: {
        aid: 6107,
        restricted: false,
        type: "TV Series",
        episode_count: 64,
        start_date: "2009-04-05",
        end_date: "2010-07-04",
        titles: [
          { title: "Hagane no Renkinjutsushi (2009)", lang: "x-jat", type: "main" },
          { title: "Fullmetal Alchemist: Brotherhood", lang: "en", type: "official" },
        ],
        related_anime: [{ aid: 4100, type: "Alternative Version", title: "Hagane no Renkinjutsushi" }],
        similar_anime: [],
        recommendations: [],
        creators: [{ id: 1450, name: "Irie Yasuhiro", type: "Direction" }],
        ratings: {
          permanent: { value: 9.55, count: 14027 },
          mean: { value: 8.95, count: 14329 },
          review: { value: 8.99, count: 12 },
        },
        resources: [],
        tags: [
          {
            id: 36,
            name: "military",
            weight: 600,
            local_spoiler: false,
            global_spoiler: false,
            verified: true,
            infobox: false,
          },
        ],
        characters: [],
        episodes: [
          {
            id: 98463,
            epno: { type: 1, value: "1" },
            length: 25,
            air_date: "2009-04-05",
            recap: false,
            titles: [{ title: "Fullmetal Alchemist", lang: "en" }],
            resources: [],
          },
        ],
      },
    },
    { aid: 999999, found: false },
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
