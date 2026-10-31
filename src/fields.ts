// The AniDB fields a Flow may choose, apart from any Worker so the Plugin's entry can offer them without loading one.

/**
 * AniDB's file fields, as anidb-udp-client names them, by the part of the result they belong in. The `mylist_*` fields
 * are left out: they come back in the file answer, which is cached, and MyList answers never are.
 */
export const FILE_FIELDS_BY_PART = {
  file: [
    "other_episodes",
    "is_deprecated",
    "state",
    "size",
    "ed2k",
    "md5",
    "sha1",
    "crc32",
    "video_color_depth",
    "quality",
    "source",
    "audio_codecs",
    "audio_bitrates",
    "video_codec",
    "video_bitrate",
    "video_resolution",
    "file_extension",
    "dub_language",
    "sub_language",
    "length_seconds",
    "description",
    "aired_date",
    "anidb_filename",
  ],
  anime: [
    "anime_total_episodes",
    "highest_episode",
    "year",
    "type",
    "related_aid_list",
    "related_aid_type",
    "category_list",
    "romanji_name",
    "kanji_name",
    "english_name",
    "other_name_list",
    "short_name_list",
    "synonym_list",
    "aid_record_updated",
  ],
  episode: ["epno", "ep_name", "ep_romanji_name", "ep_kanji_name", "ep_rating", "ep_vote_count"],
  group: ["group_name", "group_short_name"],
} as const;

export type Part = keyof typeof FILE_FIELDS_BY_PART;
export type FileField = (typeof FILE_FIELDS_BY_PART)[Part][number];

export const FILE_FIELDS: readonly FileField[] = Object.values(FILE_FIELDS_BY_PART).flat();

/** What a Task gets back when it names no fields: enough to name and sort the file. */
export const DEFAULT_FILE_FIELDS: readonly FileField[] = [
  "romanji_name",
  "english_name",
  "epno",
  "ep_name",
  "group_short_name",
  "video_resolution",
  "video_codec",
  "audio_codecs",
  "crc32",
  "state",
];

/** AniDB's anime fields, as anidb-udp-client names them; the aid always comes back. */
export const ANIME_FIELDS = [
  "dateflags",
  "year",
  "type",
  "related_anime",
  "related_types",
  "romanji_name",
  "kanji_name",
  "english_name",
  "other_name_list",
  "short_name_list",
  "synonym_list",
  "episodes",
  "highest_ep_number",
  "special_ep_count",
  "air_date",
  "end_date",
  "url",
  "picname",
  "rating",
  "vote_count",
  "temp_rating",
  "temp_vote_count",
  "average_review_rating",
  "review_count",
  "award_list",
  "is_18_restricted",
  "ann_id",
  "allcinema_id",
  "animenfo_id",
  "tag_name_list",
  "tag_id_list",
  "tag_weight_list",
  "date_record_updated",
  "character_id_list",
  "specials_count",
  "credits_count",
  "other_count",
  "trailer_count",
  "parody_count",
] as const;

export type AnimeField = (typeof ANIME_FIELDS)[number];

/** What a Task gets back when it names no fields: enough to name the anime. */
export const DEFAULT_ANIME_FIELDS: readonly AnimeField[] = [
  "year",
  "type",
  "romanji_name",
  "english_name",
  "episodes",
];

/** A `fields` setting's schema, offering `known`. */
export const fieldsSchema = (known: readonly string[]) => ({
  type: "object",
  properties: {
    // The fields to get back, as anidb-udp-client names them; the ids always come back.
    fields: { type: "array", items: { type: "string", enum: [...known] }, minItems: 1 },
  },
  additionalProperties: false,
});

/** The fields a Task's `fields` setting chooses from `known`, or `defaults` when it names none. */
export function chosenFields<F extends string>(
  nodeType: string,
  requested: readonly string[] | undefined,
  known: readonly F[],
  defaults: readonly F[],
): F[] {
  const fields = requested ?? defaults;
  if (fields.length === 0) throw new Error(`${nodeType} needs at least one field: fix \`fields\``);
  const unknown = fields.filter((field) => !(known as readonly string[]).includes(field));
  if (unknown.length > 0) throw new Error(`${nodeType} has no field ${unknown.join(", ")}: fix \`fields\``);
  return fields as F[];
}
