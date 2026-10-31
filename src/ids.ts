// AniDB's ids (aid, eid, fid, lid…): positive whole numbers.

export const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
