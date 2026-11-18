# MyList export as a data source: findings

Status: needs-triage

Question: can a Flow get anime and file data from a MyList export instead of asking AniDB over UDP?
Short answer: yes. Both exports we have are easy to parse on Node and Deno, and they hold almost everything
`AniDBIdentifyFile`, `AniDBAnime` and `AniDBMyListGet` return. The open questions are semantics and staleness, not parsing.

## What an export is

- Requested on the website, or over UDP with `MYLISTEXPORT template=…` (`client.request_mylist_export`). AniDB builds it
  when load is low (up to 24 h) and sends a message with a download link. One export can be queued at a time.
- A `.tgz` holding `changelog.txt` plus one data file. The archive name is `<id>-<n>-<uid>.tgz`.
- A snapshot: correct as of its `ExportDate`, never updated afterwards.

## The two samples (both from the same list on 2026-10-28)

| | `txt-udp-mylist` (v0.72) | `xml-singlefile-dataonly` (v3.0) |
| --- | --- | --- |
| Size | 0.5 MB tgz → 1.9 MB `mylist.txt` | 6.3 MB tgz → 92 MB `mylist.xml` |
| Per file | UDP `MYLIST` line: lid, fid, eid, aid, gid, date, state, viewdate, storage, source, other, filestate (raw unix times), plus `# File:` ed2k name and `# UID: size:ed2k` | Everything about the file: ed2k, size, CRC, codecs, resolution, group name, version/CRC state, release date, list date, view date, MyState, MyFileState… |
| Anime / episode | ids only | Full `anime` (names, year, type, eps, rating…), `title` (all titles per language), `episode` (epno, names, length, aired), `episode_title`, `anime_group`, tags, categories, companies |
| MyList id (lid) | yes | **no**: the XML has no lid |
| Dates | unix seconds | `dd.mm.yyyy hh:mm` strings, which look like UTC (a ViewDate of 27.09.2022 07:14 matches unix 1664262850) |
| Request over UDP | in anidb-udp-client's `EXPORT_TEMPLATES` | **not** in the list, so the client refuses it; request it on the website |

Shared shape quirks:

- **A file that covers several episodes is listed once per episode.** 10,629 files become 10,933 rows. In the text export, 102 fids repeat (same lid, different eid, with a `# Related Ep:` line). In the XML, 106 fids repeat in `file`, and `file_episode` records the episode ranges (Start%/End%). So fid alone is not a unique key: a lookup by fid or ed2k can return several episodes.
- MyState codes match UDP's (0 unknown, 1 on HDD, 2 on CD, 3 deleted), and so do the filestate codes (0 normal, 11/13/15/100…).
- `ByteCount`-style numbers use `.` as the thousands separator (`196.113.677`).
- Every CDATA value is on one line, and 9 CR characters sit inside values. A plain in-memory regex split handles the whole 92 MB XML in about 125 ms on Node.

## How it maps onto this Plugin

What a lookup by **ed2k+size or fid** can answer from the XML:

- `file`: fid, size, ed2k, crc32, codecs, resolution, file type, version and CRC state (`StateCRCOK`, `VersionName`)
- `anime`: aid, romaji/kanji/English names, year, type, episode counts, plus other titles from `title`
- `episode`: eid, epno, names, length, aired
- `group`: gid, name, short name
- MyList `entry`: state, viewdate, storage, source, other, filestate, and list date, but not lid (only in the txt export)

The XML's field names are not UDP's (`Name` ↔ `romanji_name`, `GShortName` ↔ `group_short_name`, `EpNo` ↔ `epno`…).
For a Flow to switch between the UDP Node and the export Node, the export Node would have to map them onto
`fields.ts`'s names and `outputs.ts`'s shapes.

## What differs from the UDP Node Types (decide these first)

1. **"Not found" means something else.** The export only knows files that were in *your* MyList at export time.
   `found: false` would mean "not in that snapshot", not "AniDB does not know it". It needs its own word and output
   field, or a Flow will conclude a file is unknown to AniDB when it is merely new.
2. **Staleness.** Watched state, files added since, renamed titles: all as of `ExportDate`. Results should carry the
   export date so a Flow can decide whether to trust them or fall back to UDP.
3. **No Session, no credentials, no Circuit breaker, no Request queue.** It is pure local reading, like
   `AniDBHashFile`, so the Node Types would not be Session Workers and would not take the Profile's AniDB fields.

## Shape options

**Where it lives**

- **A. New Node Types in this Plugin (recommended).** They reuse `fields.ts`, `outputs.ts`, `file-ref.ts`, `ids.ts`, the
  data directory and Allowed roots, and ship and version together. They don't touch the Session, so they stay
  independent of the UDP side in every way that matters at run time.
- **B. A separate Plugin** (its own id, e.g. `fyflow-ext.anidb-export`). It needs no anidb-udp-client and no credentials,
  but the output schemas would be duplicated or factored into a shared package, and there would be two releases and two
  index entries. Worth it only if people should be able to install it without the UDP Plugin.

**How the export is read**

- **Import once, then query (recommended).** An `…Import` Node reads a `.tgz`/`.xml`/`.txt` path (checked with
  `allowedPath(…, "read")`, as in ADR-0005), unpacks it (`node:zlib` gunzip plus a ~30-line tar reader, which works on
  Node and Deno), and loads it into a SQLite file in the data directory (`node:sqlite`, as in ADR-0004), replacing the
  previous snapshot in one transaction. The lookup Nodes are then indexed queries on ed2k+size, fid, aid, eid, or title.
  Several Host processes and a Reload are safe, as with the Cache.
- **Read on every Task.** Each lookup takes the export path and parses it, perhaps memoised by path and mtime. It is
  simpler, but a 92 MB XML per Worker instance, re-read after every idle timeout, costs too much for a batch Flow.

**Which template**

- Take `xml-singlefile-dataonly` as the main input: it is the only one with anime and episode data.
- Optionally also accept `txt-udp-mylist` to add lids, either merged by fid or as an `entry`-only import.
- Reject other templates with a clear message, recognised by their header (the XML comment or the `# MYLIST export`
  first line).

**Candidate Node Types** (names to be settled in GLOSSARY.md)

- `AniDBExportImport`: path → `{ exportDate, anime, episodes, files }` counts.
- `AniDBExportFile`: fid or ed2k+size → `inExport`, file/anime/episode/group as `AniDBIdentifyFile` shapes them, the
  MyList `entry`, and `exportDate`. A multi-episode file returns `episodes: [...]`, or the first episode plus the rest.
- `AniDBExportAnime`: aid or title → anime as `AniDBAnime` shapes it, plus MyList progress (`MyEps`, `WatchedEps`…).
- Later: `AniDBExportRequest`, which queues an export over UDP. It is a Session Worker, and only for templates the client allows.

## Decided (2026-11-18)

- The Node Types go in this Plugin.
- `AniDBExportFile` is a drop-in for `AniDBIdentifyFile`: same `fields` names, same output shape.
- `AniDBExportAnime` follows anidb-udp-client 2.1.0's HTTP anime result (`HTTPAnimeResult`, from `AnidbHTTPClient.anime()`)
  where the export allows, and has its own shape only where it can't.

## Gaps: `AniDBExportFile` against `AniDBIdentifyFile`'s `FILE_FIELDS`

Compared against the 8 UDP file answers in the Host's Cache (none of them are in the export) and the XML's `file`,
`episode`, `anime`, `title` and `file_episode` tables. ✓ means the same value, ~ means derivable with a conversion or
only in part, ✗ means missing.

| Part | Field | From the export |
| --- | --- | --- |
| file | `size`, `ed2k`, `md5`, `sha1`, `crc32`, `video_codec`, `video_bitrate`, `video_resolution`, `length_seconds` | ✓ `Size`, `ed2kHash`, `MD5`, `SHA1`, `CRC`, `VCodecName`, `VBitRate`, `ResName`, `Length` |
| file | `state` | ✓ `State`, the same bit field, so `decodeFileState` applies |
| file | `quality`, `source` | ✓ `QualityName`, `TypeName` |
| file | `file_extension` | ✓ the **first** `<FileType>`: the tag appears twice, as the extension (`mkv`) and as a type id (`10`) |
| file | `description` | ✓ probably `Other`, the file's comment |
| file | `audio_codecs`, `audio_bitrates`, `dub_language`, `sub_language` | ~ only the first two audio and two subtitle streams (`ACodecName`/`ACodecName2`…). 20 files have more audio streams, 64 more subtitle streams. UDP lists every stream, joined with `'` |
| file | `other_episodes` | ~ from `file_episode` (eid, Start%, End%), rebuilt into UDP's `eid,percent'…` form |
| file | `anidb_filename` | ~ `ed2kName`, the name seen on ed2k, not the name AniDB generates (`Anime - epno - name - [group](crc).ext`) |
| file | `aired_date` | ? `EpAired` or `ReleaseDate`: it's not yet clear which one UDP means |
| file | `is_deprecated`, `video_color_depth` | ✗ |
| anime | `romanji_name`, `kanji_name`, `english_name`, `type`, `anime_total_episodes`, `aid_record_updated` | ✓ `Name`, `NameKanji`, `NameEnglish`, `TypeName`, `Eps`, `Update` (unix) |
| anime | `other_name_list`, `short_name_list`, `synonym_list` | ✓ the `title` table by `TitleTypeName`: `official`, `short`, `syn` |
| anime | `year` | ~ `Year` is `2007` for a single year, where UDP always gives a range (`2012-2012`) |
| anime | `category_list` | ~ `anime_category` holds AniDB's older categories, which are not the same set as UDP's tag names |
| anime | `highest_episode`, `related_aid_list`, `related_aid_type` | ✗ |
| episode | `ep_name`, `ep_romanji_name`, `ep_kanji_name`, `ep_vote_count` | ✓ `EpName`, `EpNameRomaji`, `EpNameKanji`, `EpVotes` |
| episode | `epno` | ~ `EpNo` is unpadded (`1`), while UDP pads (`01`) |
| episode | `ep_rating` | ~ `EpRating` is `5.98`, while UDP gives an integer ×100 (`598`) |
| group | `group_name`, `group_short_name` | ✓ `GName`, `GShortName` |
| MyList entry | `fid`, `eid`, `aid`, `gid`, `date`, `state`, `viewdate`, `storage`, `source`, `filestate` | ✓ (`ListDate`, `MyState`, `ViewDate`, `MyFileState`) |
| MyList entry | `lid`, `other` | ✗ in the XML; both are in the txt export |

Rows that can't be identified:

- **47% of file rows (5,136 of 10,933) are generic files**: `Generic=1`, no ed2k, size 0. They can be found only by fid.
  By ed2k and size they are always "not in the export".

## Gaps: `AniDBExportAnime` against `HTTPAnimeResult`

Compared against anidb-udp-client's live fixture for aid 6107 (`src/parsers/__tests__/fixtures/http-anime-6107.xml`,
29.10.2026), which is also in the export, made the same day. The fixture is trimmed: only the first tags and
characters, and one episode per type.

| `HTTPAnimeResult` | From the export |
| --- | --- |
| `aid`, `type`, `episode_count`, `url`, `description` | ✓ `AnimeID`, `TypeName`, `Eps`, `URL`, `AnimeDescription` (its text formatting is unchecked: the export writes `` ` `` for `'` and `<br />` for line breaks) |
| `start_date`, `end_date` | ✓ `StartDate`/`EndDate`, converted from `dd.mm.yyyy` to `yyyy-mm-dd` |
| `ratings.permanent`, `.mean`, `.review` | ✓ `Rating`/`Votes`, `TempRating`/`TempVotes`, `ReviewRating`/`Reviews`. Identical for 6107 (9.55/14027, 8.95/14329, 8.99/12) |
| `restricted` | ~ probably `Hentai` |
| `titles` | ~ the `title` table. Types match except `syn` ↔ `synonym`. Languages are **names** (`japanese (transcription)`, 55 of them) where HTTP has **codes** (`x-jat`), so a name→code table is needed, or a join with the titles dump `AnidbTitles` already loads |
| `creators` | ✓ the `company` table: the **same ids** as HTTP (1450 Irie Yasuhiro, Direction), and `CompanyApTypeName` is HTTP's `type` |
| `episodes` | ~ only episodes the user has in MyList (64 of 102 for 6107; 805 of 1,377 anime are partial). `id`, `epno {type, value}` (from the S/C/T/P/O prefix: 1 regular, 2 S, 3 C, 4 T, 5 P, 6 O), `length`, `air_date`, `rating`, `recap`, `titles` and `update` are derivable; `summary` and `resources` are missing |
| `tags` | ✗ the `tag` table is **empty** in this export. `anime_category` is **not** a substitute: different ids (military is category 171, tag 36; shounen is category 5, tag 922), and no spoiler or verified flags |
| `resources` | ~ only ANN, AnimeNfo, AllCinema and AnimePlanet (6107 has 19 resources over HTTP) |
| `related_anime`, `similar_anime`, `recommendations`, `characters`, `picture` | ✗ |

What the export has that HTTP doesn't: MyList progress (`MyEps`, `WatchedEps`, `UnWatchedEps`…, `ByteCount`), the user's
votes, wishlist, awards, and `anime_group` (each group's release state and episode range).

Shaping decision still open: for the parts the export lacks, either leave the key out (honest, but not a `HTTPAnimeResult`)
or return `[]` (type-compatible, but `related_anime: []` reads as "has none"). The recommendation is to leave it out
and carry the MyList extras under a part of their own (`mylist`), so nothing pretends to be HTTP data it isn't.

## Not checked yet

- Whether the download link in AniDB's message can be fetched without a logged-in web session (if so, a Flow could
  fetch it).
- Whether `xml-singlefile-dataonly` is in AniDB's current server-side template list under that name (the client's list
  may be stale), and whether anidb-udp-client would accept a PR to add it.
- Which date UDP's `aired_date` is (episode aired, or file released), whether `Hentai` equals HTTP's `restricted`, and
  how `AnimeDescription`'s text differs from HTTP's `description`. Settling these needs one UDP file answer and one HTTP
  answer for something in the export, which means a registered HTTP client (separate from the UDP one).
- The AniDB wiki (`wiki.anidb.net/MyList_export`) refuses automated fetches. The template sources were read from the
  svn2github/AniDB mirror, which is old.
