// What each Node Type takes as its Task input, as JSON Schema in fyflow's subset: the Host shows it in the editor and
// to Agents, offers it as the Run's input form for a Flow starting at the Node Type, and checks a Run's payload
// against it at start. The subset has no `anyOf`, so where a Worker takes one of two forms (an episode by `eid`, or
// by `aid` and `epno`) the schema types each field, the description says which form wins, and an example shows each;
// the Worker refuses an input holding neither. Every input may carry other fields, which the AniDB Workers pass on.
const id = (what: string) => ({ type: "integer", minimum: 1, description: what }) as const;

const ed2k = {
  type: "string",
  minLength: 32,
  maxLength: 32,
  description: "The file's ed2k hash, 32 hexadecimal characters, as AniDBHashFile gives it.",
} as const;

const size = {
  type: "integer",
  minimum: 0,
  description: "The file's size in bytes, as AniDBHashFile gives it.",
} as const;

/** A file by its hash: the ed2k of 9,728,000 zero bytes, one whole chunk, from AniDB's wiki. */
const byHash = { ed2k: "fc21d9af828f92a8df64beac3357425d", size: 9_728_000 };

/** A file on AniDB: by its fid, or else by its ed2k and size. */
const FILE_INPUT = {
  type: "object",
  description:
    "The file: its `fid`, or else its `ed2k` and `size` as AniDBHashFile gives them. The `fid` wins when there are both.",
  properties: { fid: id("The file's AniDB id."), ed2k, size },
  examples: [{ fid: 1 }, byHash],
} as const;

export const ANIME_INPUT = {
  type: "object",
  description: "The anime: its `aid`, or else one of its titles on AniDB as `title`.",
  properties: {
    aid: id("The anime's AniDB id."),
    title: {
      type: "string",
      minLength: 1,
      description:
        "One of the anime's titles on AniDB, used when there is no `aid`. An all-digit title is refused.",
    },
  },
  examples: [{ aid: 1 }, { title: "Cowboy Bebop" }],
} as const;

export const EPISODE_INPUT = {
  type: "object",
  description: "The episode: its `eid`, or else its anime's `aid` and its number in that anime as `epno`.",
  properties: {
    eid: id("The episode's AniDB id."),
    aid: id("The anime's AniDB id, used with `epno` when there is no `eid`."),
    epno: {
      type: ["integer", "string"],
      minLength: 1,
      description:
        "The episode's number in its anime as AniDB numbers it: 1 for a regular episode, or S1 for a special, C1 for a credit (an opening or ending), T1 for a trailer, P1 for a parody, O1 for another.",
    },
  },
  examples: [{ eid: 1 }, { aid: 1, epno: 1 }, { aid: 1, epno: "S1" }],
} as const;

export const IDENTIFY_FILE_INPUT = FILE_INPUT;
export const MYLIST_GET_INPUT = FILE_INPUT;
export const MYLIST_ADD_INPUT = FILE_INPUT;

export const HASH_FILE_INPUT = {
  type: "object",
  description: "The file to hash, by its absolute `path`, which must lie under one of the Profile's Roots.",
  properties: {
    path: { type: "string", minLength: 1, description: "The file's absolute path." },
  },
  required: ["path"],
  examples: [{ path: "D:\\Anime\\Cowboy Bebop\\01.mkv" }, { path: "/srv/anime/Cowboy Bebop/01.mkv" }],
} as const;
