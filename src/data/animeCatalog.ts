import { AnimeItem, Episode, Season, SectionCategory, StreamServer } from '../types/anime';
import { PosterDeduplicator } from '../utils/posterDedupe';

export const STREAM_SOURCES = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
];

export function buildSeasons(
  seedKey: string,
  baseYear: number,
  seasonCount: number,
  episodesPerSeason: number,
  animeTitle: string
): Season[] {
  const hash = seedKey.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const seasons: Season[] = [];

  for (let s = 1; s <= seasonCount; s++) {
    const episodes: Episode[] = [];
    const count = s === seasonCount ? Math.max(8, episodesPerSeason - 2) : episodesPerSeason;

    for (let e = 1; e <= count; e++) {
      const streamIdx = (hash + s + e) % STREAM_SOURCES.length;
      episodes.push({
        number: e,
        title: `Episode ${e}`,
        duration: '24:00',
        durationSeconds: 1440,
        videoUrl: STREAM_SOURCES[streamIdx],
        synopsis: `Season ${s}, Episode ${e} of ${animeTitle}.`,
      });
    }

    seasons.push({
      seasonNumber: s,
      name: `Season ${s}`,
      year: baseYear + (s - 1),
      episodes,
    });
  }

  return seasons;
}

interface ToonstreamFeedItemRaw {
  mal_id: string;
  slug: string;
  title: string;
  title_english?: string;
  pageUrl: string;
  images?: {
    jpg?: {
      image_url?: string;
      large_image_url?: string;
    };
  };
  backdropUrl?: string;
  synopsis?: string;
  genres?: string[];
  score?: number;
  year?: number;
  type?: string;
  isMovie?: boolean;
  episodesCount?: number;
  firstEpUrl?: string;
}

function mapToonstreamToAnimeItem(
  raw: ToonstreamFeedItemRaw,
  categoryOverride?: SectionCategory,
  index = 0,
  explicitIsHero?: boolean
): AnimeItem {
  const isMovie = Boolean(raw.isMovie || raw.type === 'Movie');
  const epCount = Math.max(1, raw.episodesCount || (isMovie ? 1 : 12));

  const initialEpisodes: Episode[] = Array.from({ length: epCount }, (_, i) => ({
    number: i + 1,
    title: isMovie ? 'Full Movie' : `Episode ${i + 1}`,
    duration: isMovie ? '110:00' : '24:00',
    durationSeconds: isMovie ? 6600 : 1440,
    videoUrl: STREAM_SOURCES[i % STREAM_SOURCES.length],
    episodeUrl: i === 0 && raw.firstEpUrl ? raw.firstEpUrl : undefined,
    synopsis: raw.synopsis || `${raw.title} — ${isMovie ? 'Full Movie' : `Episode ${i + 1}`}`,
  }));

  const rawPoster =
    raw.images?.jpg?.large_image_url ||
    raw.images?.jpg?.image_url ||
    '';
  const poster =
    rawPoster && rawPoster.startsWith('http') && rawPoster.includes('toonstream')
      ? `/api/poster?url=${encodeURIComponent(rawPoster)}`
      : rawPoster || '/images/hero_anime_epic_1793052173700.jpg';
  const banner =
    raw.backdropUrl && raw.backdropUrl.startsWith('http') && raw.backdropUrl.includes('toonstream')
      ? `/api/poster?url=${encodeURIComponent(raw.backdropUrl)}`
      : raw.backdropUrl || poster;

  const cleanGenres =
    Array.isArray(raw.genres) && raw.genres.length > 0
      ? raw.genres.slice(0, 3)
      : isMovie
      ? ['Anime Movie', 'HD']
      : categoryOverride === 'hindi_dubbed'
      ? ['Hindi Dubbed', 'Anime']
      : categoryOverride === 'action'
      ? ['Action', 'Adventure']
      : categoryOverride === 'fantasy'
      ? ['Fantasy', 'Supernatural']
      : categoryOverride === 'scifi'
      ? ['Sci-Fi', 'Mystery']
      : ['Anime', 'HD'];

  const assignedCategory: SectionCategory =
    categoryOverride ||
    (isMovie
      ? 'movies'
      : index < 8
      ? 'trending_large'
      : index % 3 === 0
      ? 'action'
      : index % 3 === 1
      ? 'fantasy'
      : 'popular');

  return {
    id: `ts-${raw.slug || raw.mal_id}`,
    slug: raw.slug,
    pageUrl: raw.pageUrl,
    firstEpUrl: raw.firstEpUrl,
    title: raw.title_english || raw.title,
    japaneseTitle: raw.title,
    posterUrl: poster,
    bannerUrl: banner,
    synopsis:
      raw.synopsis ||
      `Watch ${raw.title} online in high definition with multi-server playback and episode selection.`,
    type: isMovie ? 'Movie' : 'TV Series',
    year: raw.year || 2025,
    score: (raw.score || 8.5).toFixed(1),
    studio: '',
    status: isMovie ? 'Completed' : 'Ongoing',
    duration: isMovie ? '1 hr 50 min' : '24 min',
    genres: cleanGenres,
    audioLanguages:
      categoryOverride === 'hindi_dubbed'
        ? ['Hindi Dubbed', 'Japanese']
        : ['Multi-Audio', 'HD Stream'],
    category: assignedCategory,
    isHero:
      typeof explicitIsHero === 'boolean'
        ? explicitIsHero
        : index < 6 && !categoryOverride,
    seasons: [
      {
        seasonNumber: 1,
        name: isMovie ? 'Movie' : 'Season 1',
        year: raw.year || 2025,
        episodes: initialEpisodes,
      },
    ],
  };
}

export interface SeriesScrapeResult {
  title?: string;
  synopsis?: string;
  genres?: string[];
  isMovie?: boolean;
  seasons: Season[];
}

export async function fetchToonstreamSeriesDetails(
  anime: AnimeItem
): Promise<SeriesScrapeResult | null> {
  if (!anime.pageUrl) return null;

  try {
    const res = await fetch(
      `/api/toonstream/series?url=${encodeURIComponent(anime.pageUrl)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success || !Array.isArray(json.episodes) || json.episodes.length === 0) {
      return null;
    }

    const bySeason = new Map<number, Episode[]>();
    json.episodes.forEach(
      (
        ep: { id: number; season?: number; episode: number; title: string; url: string },
        idx: number
      ) => {
        const sNum =
          typeof ep.season === 'number' && !Number.isNaN(ep.season) ? ep.season : 1;
        const list = bySeason.get(sNum) || [];
        list.push({
          number: ep.episode || list.length + 1,
          title: ep.title || `Episode ${ep.episode || idx + 1}`,
          duration: json.isMovie ? '110:00' : '24:00',
          durationSeconds: json.isMovie ? 6600 : 1440,
          videoUrl: STREAM_SOURCES[idx % STREAM_SOURCES.length],
          episodeUrl: ep.url,
          synopsis: json.synopsis || anime.synopsis,
        });
        bySeason.set(sNum, list);
      }
    );

    // Order Season 1, Season 2, ..., Season N naturally, placing Season 0 (Specials) after numbered seasons
    const seasons: Season[] = Array.from(bySeason.entries())
      .sort((a, b) => {
        const orderA = a[0] === 0 ? 9999 : a[0];
        const orderB = b[0] === 0 ? 9999 : b[0];
        return orderA - orderB;
      })
      .map(([sNum, eps]) => ({
        seasonNumber: sNum,
        name: json.isMovie
          ? 'Movie'
          : sNum === 0
          ? 'Specials'
          : `Season ${sNum}`,
        year: anime.year + Math.max(0, sNum - 1),
        episodes: eps.sort((a, b) => a.number - b.number),
      }));

    return {
      title: json.title || anime.title,
      synopsis: json.synopsis || anime.synopsis,
      genres:
        Array.isArray(json.genres) && json.genres.length > 0
          ? json.genres.slice(0, 4)
          : anime.genres,
      isMovie: Boolean(json.isMovie),
      seasons,
    };
  } catch {
    return null;
  }
}

export async function fetchToonstreamEpisodeServers(
  episodeUrl: string,
  signal?: AbortSignal
): Promise<{ directUrl: string; servers: StreamServer[] }> {
  const res = await fetch(
    `/api/toonstream/episode?episodeUrl=${encodeURIComponent(episodeUrl)}`,
    { signal }
  );
  if (!res.ok) {
    return { directUrl: episodeUrl, servers: [] };
  }
  const json = await res.json();
  return {
    directUrl: json?.directUrl || episodeUrl,
    servers: Array.isArray(json?.servers) ? json.servers : [],
  };
}

// Optional AniList backup only if ToonStream is completely unreachable
interface AniListMediaRaw {
  id: number;
  title?: { english?: string | null; romaji?: string | null; native?: string | null };
  coverImage?: { extraLarge?: string | null; large?: string | null };
  bannerImage?: string | null;
  description?: string | null;
  format?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  episodes?: number | null;
  duration?: number | null;
  status?: string | null;
  genres?: string[];
  studios?: { nodes?: Array<{ name: string }> };
}

function stripHtml(html?: string | null): string {
  if (!html) return 'An acclaimed anime series.';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapAniListToAnimeItem(media: AniListMediaRaw, index: number): AnimeItem {
  const cleanTitle = media.title?.english || media.title?.romaji || 'Untitled Anime';
  const genres = (media.genres || []).slice(0, 3);
  const year = media.seasonYear || 2025;
  const isMovie = media.format === 'MOVIE';
  const totalEps = media.episodes && media.episodes > 0 ? Math.min(media.episodes, 36) : 24;

  return {
    id: `al-${media.id}`,
    title: cleanTitle,
    japaneseTitle: media.title?.native || media.title?.romaji || cleanTitle,
    posterUrl: media.coverImage?.extraLarge || media.coverImage?.large || '',
    bannerUrl: media.bannerImage || media.coverImage?.extraLarge || '',
    synopsis: stripHtml(media.description),
    type: isMovie ? 'Movie' : 'TV Series',
    year,
    score: media.averageScore ? (media.averageScore / 10).toFixed(1) : '8.5',
    studio: media.studios?.nodes?.[0]?.name || '',
    status: media.status === 'RELEASING' ? 'Ongoing' : 'Completed',
    duration: media.duration ? `${media.duration} min` : '24 min',
    genres: genres.length > 0 ? genres : ['Animation'],
    audioLanguages: ['Japanese (SUB)', 'English (DUB)'],
    category: index < 8 ? 'trending_large' : isMovie ? 'movies' : 'popular',
    isHero: Boolean(media.bannerImage && index < 6),
    seasons: buildSeasons(`al-${media.id}`, year, isMovie ? 1 : 2, isMovie ? 1 : 12, cleanTitle),
  };
}

const ANILIST_FALLBACK_QUERY = `
query {
  Page(page: 1, perPage: 36) {
    media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
      id
      title { english romaji native }
      coverImage { extraLarge large }
      bannerImage
      description(asHtml: false)
      format
      seasonYear
      averageScore
      episodes
      duration
      status
      genres
      studios(isMain: true) { nodes { name } }
    }
  }
}
`;

let cachedCatalog: AnimeItem[] | null = null;

export async function fetchLiveAnimeCatalog(): Promise<AnimeItem[]> {
  if (cachedCatalog) return cachedCatalog;

  const collected: AnimeItem[] = [];
  const deduper = new PosterDeduplicator();

  // 1. Primary Multi-Section Non-Overlapping Home Catalog
  try {
    const homeRes = await fetch('/api/toonstream/home-catalog');
    if (homeRes.ok) {
      const homeJson = await homeRes.json();
      const pools = homeJson?.pools;
      if (homeJson?.success && pools) {
        const takeFromRawPool = (
          rawList: ToonstreamFeedItemRaw[] | undefined,
          category: SectionCategory,
          limit: number,
          isHeroFlag = false
        ) => {
          if (!Array.isArray(rawList)) return;
          let count = 0;
          for (let i = 0; i < rawList.length; i++) {
            const mapped = mapToonstreamToAnimeItem(
              rawList[i],
              category,
              i,
              isHeroFlag
            );
            if (!mapped.posterUrl || !mapped.posterUrl.trim()) continue;
            if (deduper.has(mapped)) continue;
            deduper.mark(mapped);
            collected.push(mapped);
            count += 1;
            if (count >= limit) break;
          }
        };

        // Allocate strictly unique anime across every single Home Page section
        takeFromRawPool(pools.hero, 'featured_large', 6, true);
        takeFromRawPool(pools.trending, 'trending_large', 8, false);
        takeFromRawPool(pools.hindi_dubbed, 'hindi_dubbed', 20, false);
        takeFromRawPool(pools.popular, 'popular', 20, false);
        takeFromRawPool(pools.action, 'action', 20, false);
        takeFromRawPool(pools.fantasy, 'fantasy', 20, false);
        takeFromRawPool(pools.scifi, 'scifi', 20, false);
        takeFromRawPool(pools.movies, 'movies', 20, false);

        // Allocate remaining strictly unique anime for "All Available Anime" & extra catalog
        const remainingRaw: ToonstreamFeedItemRaw[] = [
          ...(Array.isArray(pools.extra) ? pools.extra : []),
          ...(Array.isArray(pools.popular) ? pools.popular : []),
          ...(Array.isArray(pools.action) ? pools.action : []),
          ...(Array.isArray(pools.fantasy) ? pools.fantasy : []),
          ...(Array.isArray(pools.scifi) ? pools.scifi : []),
          ...(Array.isArray(pools.hindi_dubbed) ? pools.hindi_dubbed : []),
          ...(Array.isArray(pools.movies) ? pools.movies : []),
        ];
        takeFromRawPool(remainingRaw, 'featured_large', 60, false);
      }
    }
  } catch {
    // Fallback to standard feed below if home-catalog fails
  }

  // 2. Fallback to standard feed if needed
  if (collected.length === 0) {
    try {
      const [animePage1, animePage2, hindiPage1, moviesPage1] =
        await Promise.allSettled([
          fetch('/api/toonstream/feed?category=anime&page=1').then((r) => r.json()),
          fetch('/api/toonstream/feed?category=anime&page=2').then((r) => r.json()),
          fetch('/api/toonstream/feed?category=hindi-dubbed&page=1').then((r) =>
            r.json()
          ),
          fetch('/api/toonstream/feed?category=movies&page=1').then((r) => r.json()),
        ]);

      const addToonstreamBatch = (
        result: PromiseSettledResult<{ animes?: ToonstreamFeedItemRaw[] }>,
        categoryOverride?: SectionCategory,
        offset = 0
      ) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value?.animes)) {
          result.value.animes.forEach((raw: ToonstreamFeedItemRaw, idx: number) => {
            const mapped = mapToonstreamToAnimeItem(
              raw,
              categoryOverride,
              offset + idx
            );
            if (!deduper.has(mapped)) {
              deduper.mark(mapped);
              collected.push(mapped);
            }
          });
        }
      };

      addToonstreamBatch(animePage1, undefined, 0);
      addToonstreamBatch(animePage2, undefined, 16);
      addToonstreamBatch(hindiPage1, 'hindi_dubbed', 32);
      addToonstreamBatch(moviesPage1, 'movies', 48);
    } catch {
      // Fallback below only if scraper completely fails
    }
  }

  if (collected.length === 0) {
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: ANILIST_FALLBACK_QUERY }),
      });
      if (res.ok) {
        const json = await res.json();
        const media: AniListMediaRaw[] = json?.data?.Page?.media || [];
        media.forEach((m, idx) => {
          const mapped = mapAniListToAnimeItem(m, idx);
          if (!deduper.has(mapped)) {
            deduper.mark(mapped);
            collected.push(mapped);
          }
        });
      }
    } catch {
      // Ignore network failure
    }
  }

  if (collected.length > 0) {
    cachedCatalog = collected;
  }

  return collected;
}

export async function searchLiveAnime(
  query: string,
  signal?: AbortSignal
): Promise<AnimeItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  const results: AnimeItem[] = [];
  const seen = new Set<string>();

  const tsRes = await fetch(
    `/api/toonstream/search?q=${encodeURIComponent(trimmed)}`,
    { signal }
  );
  if (tsRes.ok) {
    const tsJson = await tsRes.json();
    if (Array.isArray(tsJson?.animes)) {
      tsJson.animes.forEach((raw: ToonstreamFeedItemRaw, idx: number) => {
        const item = mapToonstreamToAnimeItem(raw, 'popular', idx + 10);
        if (!seen.has(item.id)) {
          seen.add(item.id);
          results.push(item);
        }
      });
    }
  }

  return results;
}
