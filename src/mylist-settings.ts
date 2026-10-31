// AniDBMyListAdd's settings, apart from its Worker so the Plugin's entry can offer them to Flows without loading it.
import type { AnidbUDPClient } from "anidb-udp-client";

export type MyListOptions = NonNullable<Parameters<AnidbUDPClient["mylist_add_by_file"]>[1]>;
type MyListState = NonNullable<MyListOptions["state"]>;

/** Where a MyList entry's file is, as anidb-udp-client names it. */
export const MYLIST_STATES: readonly MyListState[] = [
  "unknown",
  "internal_storage",
  "external_storage",
  "deleted",
  "remote_storage",
];

export type MyListSettings = Omit<MyListOptions, "state"> & { state?: string };

export const MYLIST_SETTINGS_SCHEMA = {
  type: "object",
  properties: {
    // Update an entry already in MyList with these values, instead of leaving it as it is.
    edit: { type: "boolean" },
    state: { type: "string", enum: [...MYLIST_STATES] },
    viewed: { type: "boolean" },
    // When it was watched, in seconds since 1970.
    viewdate: { type: "integer", minimum: 0 },
    // Where the file came from, such as ed2k, irc or a disc.
    source: { type: "string" },
    // A label for where the file is kept.
    storage: { type: "string" },
    // Notes on the entry.
    other: { type: "string" },
  },
  additionalProperties: false,
} as const;
