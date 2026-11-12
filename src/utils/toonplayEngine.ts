/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ToonplayServer {
  id: string;
  name: string;
  url: string;
  kind?: 'iframe' | 'hls' | 'mp4';
}

export interface ToonplayLang {
  code: string;
  label: string;
}

export interface ToonplayEpisodeResponse {
  success: boolean;
  slug: string;
  season: number;
  ep: number;
  lang: string;
  isMovie: boolean;
  directFallbackUrl: string;
  servers: ToonplayServer[];
  availableLangs: ToonplayLang[];
}

/**
 * Normalizes title, anime ID, or page URL into a clean ToonPlay/AnimeSalt slug
 */
export function cleanAnimeSlug(input: string): string {
  if (!input) return 'anime';
  let s = String(input).trim();
  s = s.replace(/^https?:\/\/[^/]+/i, '');
  s = s.replace(/^\/?(series|movies|anime|episode)\//i, '');
  s = s.replace(/^(series|movies)-/i, '');
  s = s.replace(/\/.*$/, '');
  s = s.toLowerCase().trim();
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  if (s.startsWith('ts-')) {
    s = s.replace(/^ts-/, '');
  }
  // Normalization for Re:Zero and similar titles
  if (s.startsWith('rezero')) {
    s = s.replace(/^rezero/, 're-zero');
  }
  return s || 'anime';
}

/**
 * Builds the deterministic live ToonPlay stream URL for 0ms immediate mount
 */
export function getDeterministicStreamUrl({
  slug,
  season = 1,
  ep = 1,
  server = 'multi-1',
  lang = 'hin',
  isMovie = false,
}: {
  slug: string;
  season?: number;
  ep?: number;
  server?: string;
  lang?: string;
  isMovie?: boolean;
}): string {
  const clean = cleanAnimeSlug(slug);
  if (isMovie) {
    return `https://toonplay.in/watch/movies-${clean}?season=1&ep=1&server=multi-1&lang=${lang}`;
  }
  return `https://toonplay.in/watch/series-${clean}?season=${season}&ep=${ep}&server=${server}&lang=${lang}`;
}
