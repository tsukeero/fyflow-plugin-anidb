// A fake AniDB HTTP API for tests: it stands in for the global `fetch` anidb-udp-client's HTTP client calls, answering
// from a script and recording every request. No test ever reaches the real AniDB.
import { vi } from "vitest";

/** A request as the fake received it: the query's parameters. */
export type HttpRequest = Record<string, string>;

/** Answers one request: the body, or a promise of one, for a slow or held answer. */
export type HttpHandler = (params: HttpRequest) => string | Promise<string>;

export interface FakeAniDBHttp {
  readonly received: HttpRequest[];
  /** Puts the real `fetch` back. */
  restore(): void;
}

/** Stubs `fetch` with `handler` until `restore()`. */
export function startFakeAniDBHttp(handler: HttpHandler): FakeAniDBHttp {
  const received: HttpRequest[] = [];
  vi.stubGlobal("fetch", async (url: string | URL) => {
    const params = Object.fromEntries(new URL(url).searchParams);
    received.push(params);
    return new Response(await handler(params), { status: 200, headers: { "content-type": "text/xml" } });
  });
  return { received, restore: () => vi.unstubAllGlobals() };
}

/** Cowboy Bebop, as the HTTP API answers `request=anime&aid=1`: a little of each part. */
export const BEBOP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="1" restricted="false">
  <type>TV Series</type>
  <episodecount>26</episodecount>
  <startdate>1998-04-03</startdate>
  <enddate>1999-04-24</enddate>
  <titles>
    <title xml:lang="x-jat" type="main">Cowboy Bebop</title>
    <title xml:lang="ja" type="official">カウボーイビバップ</title>
  </titles>
  <relatedanime>
    <anime id="5" type="Side Story">Cowboy Bebop: Tengoku no Tobira</anime>
  </relatedanime>
  <creators>
    <name id="4234" type="Direction">Watanabe Shinichirou</name>
  </creators>
  <description>In the year 2071, humanity has colonised several of the planets and moons of the solar system.</description>
  <ratings>
    <permanent count="10000">8.7</permanent>
    <temporary count="11000">8.8</temporary>
  </ratings>
  <tags>
    <tag id="2604" weight="600" localspoiler="false" globalspoiler="false" verified="true" update="2018-01-21">
      <name>space</name>
    </tag>
  </tags>
  <episodes>
    <episode id="1" update="2011-07-01">
      <epno type="1">1</epno>
      <length>25</length>
      <airdate>1998-10-24</airdate>
      <title xml:lang="en">Asteroid Blues</title>
    </episode>
  </episodes>
</anime>`;

/** The HTTP API's answers that there is no such anime, and that the client is banned. */
export const NOT_FOUND_XML = "<error>Anime not found</error>";
export const BANNED_XML = "<error>Banned</error>";
