// AniDB's file fields, apart from any Worker so the Plugin's entry can offer them to Flows without loading one.

/**
 * AniDB's file fields, as anidb-udp-client names them, by the part of the result they belong in. The `mylist_*` fields
 * are left out: they come back in the file answer, which is cached, and MyList answers never are.
 */
export const FIELDS = {
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

export type Part = keyof typeof FIELDS;
export type FileField = (typeof FIELDS)[Part][number];

export const FILE_FIELDS: readonly FileField[] = Object.values(FIELDS).flat();

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
