# 17: Identify a file by its fid

**What to build:** AniDBIdentifyFile takes a file by its `fid`, or else by the `ed2k` and `size` AniDBHashFile gives,
as AniDBMyListGet and AniDBMyListAdd do. A Flow can then identify a file AniDB does not know by its hash once a person
(an Ask) or an earlier Node gives its fid. The result has the same shape either way.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] With a `fid` in its input, AniDBIdentifyFile asks AniDB by fid, and the `fid` wins over an `ed2k` and `size`.
- [x] A fid AniDB does not know is Not found (`found: false`), remembered for a day like a hash.
- [x] An input with neither form, or a malformed `fid`, is refused before anything is sent, naming the field.
- [x] Its input schema, output examples and the README show both forms.

## Comments

- Asked by the maintainer, who weighed splitting it into two Node Types (one per form) against losing `required` on
  `ed2k` and `size`. Kept as one: the other AniDB Node Types already take one of two forms, both forms return the same
  result, and a Flow with an Ask falling back to a fid needs no second Node. The Worker still refuses an input with
  neither form; what goes is fyflow's earlier warning (a Run starting at it is not refused at start for a missing
  `ed2k`, and `try_transform` passes an empty input).
- Its input schema is now the same as AniDBMyListGet's and AniDBMyListAdd's.
- The library caches a file by its fid and by its hash as an alias, so an answer by either form is reused by the other.
- Not done, at the maintainer's request: AniDBEpisode taking `episode.eid` from AniDBIdentifyFile's result.
- Version bumped to 0.0.4: the input changed.
