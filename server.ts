import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { scoreTitleMatch } from './src/utils/searchMatch.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const keepAliveHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
});

const ANIME_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

interface StreamSubtitle {
  label: string;
  lang: string;
  url: string;
}

interface StreamQualityOption {
  label: string;
  url: string;
  kind: 'mp4' | 'hls';
}

interface ServerLink {
  name: string;
  url: string;
  kind?: 'hls' | 'mp4' | 'iframe';
  subtitles?: StreamSubtitle[];
  qualities?: StreamQualityOption[];
  allowSandbox?: boolean;
}

interface StockAnimeEntry {
  mal_id: string;
  slug: string;
  title: string;
  title_english: string;
  pageUrl: string;
  images: { jpg: { image_url: string; large_image_url: string } };
  score: number;
  year: number;
  type: string;
  isMovie?: boolean;
  episodesCount?: number;
  firstEpUrl?: string;
  backdropUrl?: string;
  synopsis?: string;
  genres?: string[];
}

interface VerifiedAnimeEntry {
  hasVideo: boolean;
  episodesCount: number;
  isMovie: boolean;
  firstEpUrl?: string;
  backdropUrl?: string;
  synopsis?: string;
  genres?: string[];
  checkedAt: number;
}

interface ScrapedEpisode {
  id: number;
  season: number;
  episode: number;
  title: string;
  url: string;
}

interface CachedSeriesDetails {
  title: string;
  synopsis: string;
  genres: string[];
  isMovie: boolean;
  episodesCount: number;
  episodes: ScrapedEpisode[];
  cachedAt: number;
}

// In-memory index of all crawled in-stock anime on ToonStream for instant 2-3 letter prefix/fuzzy search
const stockIndexMap = new Map<string, StockAnimeEntry>();
const verifiedAnimeCache = new Map<string, VerifiedAnimeEntry>();
const feedCache = new Map<string, { animes: unknown[]; cachedAt: number }>();
const seriesDetailsCache = new Map<string, CachedSeriesDetails>();
const episodeServersCache = new Map<string, { servers: ServerLink[]; cachedAt: number }>();
const firePlayerTokenCache = new Map<
  string,
  { masterUrl: string; refOrigin: string; subtitles: StreamSubtitle[]; cachedAt: number }
>();

interface HomeCatalogPools {
  hero: StockAnimeEntry[];
  trending: StockAnimeEntry[];
  hindi_dubbed: StockAnimeEntry[];
  popular: StockAnimeEntry[];
  action: StockAnimeEntry[];
  fantasy: StockAnimeEntry[];
  scifi: StockAnimeEntry[];
  movies: StockAnimeEntry[];
  extra: StockAnimeEntry[];
}

let homeCatalogCache: { pools: HomeCatalogPools; cachedAt: number } | null = null;
let homeCatalogInFlight: Promise<HomeCatalogPools> | null = null;

const VERIFY_TTL = 30 * 60 * 1000; // 30 min cache
const FEED_TTL = 10 * 60 * 1000; // 10 min feed cache
const HOME_CATALOG_TTL = 15 * 60 * 1000; // 15 min multi-section home cache
const SERIES_TTL = 20 * 60 * 1000; // 20 min series seasons cache
const EPISODE_TTL = 12 * 60 * 1000; // 12 min episode servers cache
const FIREPLAYER_TOKEN_TTL = 15 * 60 * 1000; // 15 min fresh token cache

const normalizePathKey = (urlOrPath: string): string => {
  return (urlOrPath || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\/$/, '')
    .toLowerCase();
};

const normalizeToonstreamUrl = (link: string): string => {
  if (!link) return 'https://toonstream.vip';
  return link.startsWith('http')
    ? link
    : `https://toonstream.vip${link.startsWith('/') ? '' : '/'}${link}`;
};

// Parse <article> cards from any ToonStream catalog HTML page and register in stockIndexMap
const parseArticlesFromHtml = (htmlData: string): StockAnimeEntry[] => {
  const $ = cheerio.load(htmlData);
  const items: StockAnimeEntry[] = [];

  $('article').each((_, el) => {
    const title = $(el).find('.entry-title, h2, h3').first().text().trim();
    const link =
      $(el).find('a.lnk-blk').attr('href') ||
      $(el).find('a').first().attr('href') ||
      '';
    let img =
      $(el).find('img').attr('src') ||
      $(el).find('img').attr('data-src') ||
      $(el).find('img').attr('data-lazy-src') ||
      '';
    if (img.startsWith('//')) img = `https:${img}`;

    const vote = $(el).find('.vote').text().replace(/TMDB/i, '').trim() || '8.5';
    const yearText = $(el).find('.year, .date').first().text().trim();
    const parsedYear = parseInt(yearText, 10) || 2025;

    if (title && link) {
      const slug = link.replace(/\/$/, '').split('/').pop() || '';
      const largeImg = img.includes('/w')
        ? img.replace(/\/w\d+\//, '/w780/')
        : img;

      const entry: StockAnimeEntry = {
        mal_id: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        slug,
        title,
        title_english: title,
        pageUrl: link,
        images: {
          jpg: {
            image_url: img,
            large_image_url: largeImg || img,
          },
        },
        score: parseFloat(vote) || 8.5,
        year: parsedYear,
        type: link.includes('/movies/') ? 'Movie' : 'TV',
        isMovie: link.includes('/movies/'),
      };

      items.push(entry);
      const key = normalizePathKey(link);
      if (key && !stockIndexMap.has(key)) {
        stockIndexMap.set(key, entry);
      }
    }
  });

  return items;
};

// Hosts that inject unskippable ad walls or dead embeds
const AD_HEAVY_OR_BROKEN_HOSTS = [
  'abyssplayer',
  'vidmoly',
  'turbonewvid',
  'turbovidhls',
  'emturbovid',
  'voe.sx',
  'strmup.to',
  'youtube.com/embed',
  'youtu.be',
  'googletagmanager',
  'googlesyndication',
  'doubleclick',
  'disqus',
  'google_ads',
  'popads',
  'adsterra',
  'clickadu',
  'araplhn',
  'bondeddarkenedswerve',
  'endlesshandbaglinked',
];

// Hosts whose JS bundles explicitly check for iframe sandbox and refuse to play if sandboxed
const ANTI_SANDBOX_HOSTS = ['cloudy.upns', 'vidc.upns'];

const scoreCleanServerPriority = (url: string, label: string): number => {
  const u = url.toLowerCase();
  const l = label.toLowerCase();
  if (u.includes('ravok.buzz') || u.includes('vexal') || u.includes('zephyrflick')) return 98;
  if (u.includes('blakiteapi')) return 96;
  if (u.includes('drive.google.com')) return 92;
  if (u.includes('rubystm') || u.includes('streamruby')) return 86;
  if (u.includes('cloudy.upns') || u.includes('vidc.upns')) return 78;
  if (u.includes('filesforever')) {
    if (l.includes('fhd')) return 66;
    if (l.includes('hd')) return 64;
    return 62;
  }
  return 60;
};

// B. Clean Ad-Filtered Video Server Extractor
const extractServersFromHtml = (html: string): ServerLink[] => {
  const $ = cheerio.load(html);
  const cleanServers: Array<ServerLink & { priority: number }> = [];
  const fallbackServers: ServerLink[] = [];

  const registerCandidate = (rawSrc: string | undefined, rawLabel: string) => {
    if (!rawSrc) return;
    const trimmed = rawSrc.trim();
    if (
      !trimmed ||
      trimmed === 'about:blank' ||
      trimmed.endsWith('.json') ||
      trimmed.includes('/api/') ||
      trimmed.includes('ads')
    ) {
      return;
    }

    const cleanSrc = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    if (!cleanSrc.startsWith('http')) return;

    const lowerSrc = cleanSrc.toLowerCase();
    // Never include YouTube trailers or pure ad trackers
    if (
      lowerSrc.includes('youtube.com/embed') ||
      lowerSrc.includes('youtu.be') ||
      lowerSrc.includes('googletagmanager') ||
      lowerSrc.includes('googlesyndication') ||
      lowerSrc.includes('doubleclick') ||
      lowerSrc.includes('disqus')
    ) {
      return;
    }

    const isAntiSandbox = ANTI_SANDBOX_HOSTS.some((h) => lowerSrc.includes(h));
    const isAdHeavyHost = AD_HEAVY_OR_BROKEN_HOSTS.some((bad) =>
      lowerSrc.includes(bad)
    );

    if (isAdHeavyHost) {
      if (!fallbackServers.some((s) => s.url === cleanSrc)) {
        fallbackServers.push({
          name: rawLabel,
          url: cleanSrc,
          kind: 'iframe',
          allowSandbox: !isAntiSandbox,
        });
      }
      return;
    }

    if (!cleanServers.some((s) => s.url === cleanSrc)) {
      cleanServers.push({
        name: rawLabel,
        url: cleanSrc,
        kind: 'iframe',
        allowSandbox: !isAntiSandbox,
        priority: scoreCleanServerPriority(cleanSrc, rawLabel),
      });
    }
  };

  // 1. Match server buttons (.aa-tbs-video a.btn[href^="#"]) directly to their #options-X iframe
  let matchedByTab = false;
  $('.aa-tbs-video a.btn, .aa-tbs-video .btn[href^="#"]').each((idx, btn) => {
    const href = $(btn).attr('href') || '';
    const label =
      $(btn)
        .text()
        .replace(/\s+/g, ' ')
        .replace(/^Server\s*\d+\s*/i, '')
        .trim() || `Server ${idx + 1}`;

    if (href.startsWith('#') && href.length > 1) {
      const targetIframe = $(`${href} iframe`).first();
      if (targetIframe.length > 0) {
        matchedByTab = true;
        const src =
          targetIframe.attr('data-src') ||
          targetIframe.attr('src') ||
          targetIframe.attr('data-lazy-src');
        registerCandidate(src, label);
      }
    }
  });

  // 2. Fallback for direct players / movie embeds without #options-X tabs (strictly excluding #mdl-trailer)
  if (!matchedByTab || (cleanServers.length === 0 && fallbackServers.length === 0)) {
    const btnLabels: string[] = [];
    $('.aa-tbs-video .btn, .server-btn, .opt-server, [data-server]').each((_, b) => {
      const text = $(b).text().replace(/\s+/g, ' ').trim();
      if (text && !btnLabels.includes(text)) btnLabels.push(text);
    });

    $(
      '.video-player .video iframe, #aa-options iframe, #player iframe, .TPlayer iframe'
    ).each((i, el) => {
      if ($(el).closest('#mdl-trailer').length > 0) return;
      const src =
        $(el).attr('data-src') ||
        $(el).attr('src') ||
        $(el).attr('data-lazy-src');
      registerCandidate(src, btnLabels[i] || `HD ${i + 1}`);
    });
  }

  if (cleanServers.length > 0) {
    cleanServers.sort((a, b) => b.priority - a.priority);
    return cleanServers.map((s, idx) => ({
      name: s.name || `Server ${idx + 1}`,
      url: s.url,
      kind: s.kind || 'iframe',
      allowSandbox: s.allowSandbox,
    }));
  }

  return fallbackServers;
};

// Resolve FirePlayer (ravok.buzz / vexal / zephyrflick / raretoonsindia) to a 100% Native Zero-Ad Multi-Audio 1080p HLS stream
const resolveFirePlayerToken = async (
  embedUrl: string
): Promise<{
  masterUrl: string;
  refOrigin: string;
  subtitles: StreamSubtitle[];
} | null> => {
  const cached = firePlayerTokenCache.get(embedUrl);
  if (cached && Date.now() - cached.cachedAt < FIREPLAYER_TOKEN_TTL) {
    return cached;
  }

  try {
    const parsed = new URL(embedUrl);
    const hashMatch = parsed.pathname.match(/\/(?:video|v|ex)\/([a-zA-Z0-9_-]+)/i);
    if (!hashMatch) return null;
    const hash = hashMatch[1];
    const refOrigin = parsed.origin;

    const [postRes, htmlRes] = await Promise.allSettled([
      axios.post(
        `${refOrigin}/player/index.php?data=${encodeURIComponent(hash)}&do=getVideo`,
        `hash=${encodeURIComponent(hash)}&r=${encodeURIComponent('https://toonstream.us/')}`,
        {
          httpsAgent: keepAliveHttpsAgent,
          timeout: 5500,
          headers: {
            'User-Agent': ANIME_HEADERS['User-Agent'],
            Referer: embedUrl,
            Origin: refOrigin,
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
        }
      ),
      axios.get(embedUrl, {
        httpsAgent: keepAliveHttpsAgent,
        timeout: 4500,
        headers: {
          'User-Agent': ANIME_HEADERS['User-Agent'],
          Referer: 'https://toonstream.us/',
        },
      }),
    ]);

    if (postRes.status !== 'fulfilled' || !postRes.value?.data) return null;
    const payload = postRes.value.data;
    const masterUrl: string | undefined = payload.securedLink || payload.videoSource;
    if (!masterUrl || typeof masterUrl !== 'string') return null;

    const subtitles: StreamSubtitle[] = [];
    if (htmlRes.status === 'fulfilled' && typeof htmlRes.value?.data === 'string') {
      const subMatch = htmlRes.value.data.match(
        /playerjsSubtitle\s*=\s*["']([^"']+)["']/i
      );
      if (subMatch && subMatch[1]) {
        const rawEntries = subMatch[1].split(',');
        for (const entry of rawEntries) {
          const m = entry.trim().match(/^\[([^\]]+)\](https?:\/\/.+)$/i);
          if (m) {
            const label = m[1].trim();
            const vttRemote = m[2].trim();
            subtitles.push({
              label,
              lang: label.slice(0, 2).toLowerCase() || 'en',
              url: `/api/stream/vtt?url=${encodeURIComponent(vttRemote)}&ref=${encodeURIComponent(refOrigin)}`,
            });
          }
        }
      }
    }

    const resolved = {
      masterUrl,
      refOrigin,
      subtitles,
    };
    firePlayerTokenCache.set(embedUrl, { ...resolved, cachedAt: Date.now() });
    return resolved;
  } catch {
    return null;
  }
};

// Resolve blakiteapi.xyz embed to direct Rumble Cloud CDN MP4 / HLS streams (0% ads, direct CDN speed)
const resolveBlakiteDirectStream = async (
  embedUrl: string
): Promise<ServerLink | null> => {
  try {
    const parsed = new URL(embedUrl);
    if (!parsed.hostname.includes('blakiteapi')) return null;

    let apiUrl = '';
    const movieMatch = parsed.pathname.match(/\/(?:embed|play)\/movie\/([^/?#]+)/i);
    const seriesMatch = parsed.pathname.match(/\/(?:embed|play)\/([^/?#]+)\/([^/?#]+)/i);

    if (movieMatch) {
      apiUrl = `${parsed.origin}/api/get.php?id=${encodeURIComponent(movieMatch[1])}&type=movie`;
    } else if (seriesMatch) {
      apiUrl = `${parsed.origin}/api/get.php?id=${encodeURIComponent(seriesMatch[2])}&tmdbId=${encodeURIComponent(seriesMatch[1])}`;
    } else {
      return null;
    }

    const res = await axios.get(apiUrl, {
      httpsAgent: keepAliveHttpsAgent,
      timeout: 4500,
      headers: {
        'User-Agent': ANIME_HEADERS['User-Agent'],
        Referer: embedUrl,
        Accept: 'application/json',
      },
    });

    const data = res.data?.data;
    if (!res.data?.success || !data?.dataId) return null;

    const baseDURL = 'https://hugh.cdn.rumble.cloud/video/';
    const qualityCodes = ['oaa', 'baa', 'caa', 'gaa', 'haa'];
    const qualityLabels = ['240p', '360p', '480p', '720p', '1080p'];
    const isM3u8 = String(data.format || '').toUpperCase() === 'M3U8';

    const qualities: StreamQualityOption[] = [];

    if (isM3u8 && typeof data.ranges === 'string' && data.ranges.trim()) {
      const rangeMap: Record<string, string> = {};
      data.ranges
        .split('\n')
        .map((l: string) => l.trim())
        .filter(Boolean)
        .forEach((line: string) => {
          const m = line.match(/^(\d+-\d+)\s*\(([^)]+)\)/);
          if (m) rangeMap[m[2].trim()] = m[1];
        });

      qualityLabels.forEach((label, idx) => {
        if (rangeMap[label]) {
          const code = qualityCodes[idx];
          const range = rangeMap[label];
          qualities.push({
            label,
            kind: 'hls',
            url: `${baseDURL}${data.dataId}.${code}.tar?r_file=chunklist.m3u8&r_type=application%2Fvnd.apple.mpegurl&r_range=${range}`,
          });
        }
      });
    }

    if (qualities.length === 0) {
      const maxIdx = Math.min(
        Number(data.qid) || qualityLabels.length,
        qualityLabels.length
      ) - 1;
      for (let i = 0; i <= Math.max(0, maxIdx); i++) {
        const code = qualityCodes[i];
        const label = qualityLabels[i];
        qualities.push({
          label,
          kind: isM3u8 ? 'hls' : 'mp4',
          url: isM3u8
            ? `${baseDURL}${data.dataId}.${code}.tar?r_file=chunklist.m3u8&r_type=application%2Fvnd.apple.mpegurl`
            : `${baseDURL}${data.dataId}.${code}.mp4`,
        });
      }
    }

    if (qualities.length === 0) return null;

    const preferred =
      qualities.find((q) => q.label === data.quality) ||
      qualities[qualities.length - 1];

    return {
      name: 'Fast CDN',
      url: preferred.url,
      kind: preferred.kind,
      qualities: qualities.slice().reverse(),
    };
  } catch {
    return null;
  }
};

// Rewrite HLS master & variant playlists so relative /hls/ paths and Referer-locked segments stream cleanly
const rewriteHlsPlaylist = (
  rawM3u8: string,
  playlistUrl: string,
  refOrigin: string
): string => {
  const isMaster =
    rawM3u8.includes('#EXT-X-STREAM-INF') || rawM3u8.includes('#EXT-X-MEDIA:');

  let hasDefaultAudio = /#EXT-X-MEDIA:[^\n]*TYPE=AUDIO[^\n]*DEFAULT=YES/i.test(
    rawM3u8
  );

  const resolveAbs = (uri: string): string => {
    try {
      return new URL(uri.trim(), playlistUrl).href;
    } catch {
      return uri.trim();
    }
  };

  const toPlaylistProxy = (absUrl: string) =>
    `/api/stream/m3u8?url=${encodeURIComponent(absUrl)}&ref=${encodeURIComponent(refOrigin)}`;

  const toSegmentProxy = (absUrl: string) =>
    `/api/stream/seg?url=${encodeURIComponent(absUrl)}&ref=${encodeURIComponent(refOrigin)}`;

  const lines = rawM3u8.split(/\r?\n/);
  const out: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }
    if (trimmed.startsWith('##EXTM3U')) {
      continue;
    }

    if (trimmed.startsWith('#')) {
      // Ensure at least one audio track is marked DEFAULT=YES in master playlists
      if (
        isMaster &&
        !hasDefaultAudio &&
        trimmed.startsWith('#EXT-X-MEDIA:') &&
        /TYPE=AUDIO/i.test(trimmed)
      ) {
        line = line.replace(/DEFAULT=NO/i, 'DEFAULT=YES');
        hasDefaultAudio = true;
      }

      // Rewrite URI="..." inside #EXT-X-MEDIA, #EXT-X-KEY, #EXT-X-MAP, #EXT-X-I-FRAME-STREAM-INF
      const rewrittenTag = line.replace(/URI="([^"]+)"/gi, (_m, innerUri: string) => {
        const abs = resolveAbs(innerUri);
        const proxied =
          isMaster &&
          (trimmed.startsWith('#EXT-X-MEDIA:') ||
            trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF:'))
            ? toPlaylistProxy(abs)
            : toSegmentProxy(abs);
        return `URI="${proxied}"`;
      });
      out.push(rewrittenTag);
      continue;
    }

    // Non-comment URI line: in Master playlists it's a variant .m3u8; in Media playlists it's a video/audio segment
    const absUri = resolveAbs(trimmed);
    out.push(isMaster ? toPlaylistProxy(absUri) : toSegmentProxy(absUri));
  }

  return out.join('\n');
};

// Scrub popup/redirect ad scripts from HTML embed players when used as backup iframe servers
const scrubEmbedHtmlAds = (rawHtml: string, embedUrl: string): string => {
  const parsed = new URL(embedUrl);
  const baseHref = `${parsed.origin}/`;

  let cleaned = rawHtml
    // Remove external ad-network scripts
    .replace(
      /<script[^>]*src=["'][^"']*(?:ro_redirect|fentpsyllid|endlesshandbaglinked|bondeddarkenedswerve|technocosmos|popads|adsterra|clickadu|googletagmanager|googlesyndication|acscdn|histats)[^"']*["'][^>]*>\s*<\/script>/gi,
      ''
    )
    // Remove inline ad loader blocks
    .replace(
      /<script[^>]*>[\s\S]*?(?:fentpsyllid|endlesshandbaglinked|bondeddarkenedswerve|popads|adsterra|ro_redirect)[\s\S]*?<\/script>/gi,
      ''
    )
    // Disable pre-roll ad wait screen on blakiteapi
    .replace(/showVideoAd\s*=\s*true/g, 'showVideoAd = false');

  const shieldHead = `<base href="${baseHref}"><script>(function(){window.open=function(){return null;};try{Object.defineProperty(window,'popactive',{get:function(){return false;},set:function(){}});}catch(e){}})();</script><style>.rek,.pppx,.ad-overlay,#videoAdOverlay,[id*="ad-container"],[class*="adsbox"]{display:none!important;pointer-events:none!important;opacity:0!important;}</style>`;

  if (/<head[^>]*>/i.test(cleaned)) {
    cleaned = cleaned.replace(/<head[^>]*>/i, (m) => `${m}${shieldHead}`);
  } else {
    cleaned = `${shieldHead}${cleaned}`;
  }

  return cleaned;
};

// C. Video Availability Pre-Verification
const verifyAnimeVideoAvailability = async (
  link: string
): Promise<Omit<VerifiedAnimeEntry, 'checkedAt'>> => {
  const cached = verifiedAnimeCache.get(link);
  if (cached && Date.now() - cached.checkedAt < VERIFY_TTL) return cached;

  const targetUrl = normalizeToonstreamUrl(link);
  try {
    const pageRes = await axios.get(targetUrl, {
      headers: ANIME_HEADERS,
      timeout: 6000,
    });
    if (pageRes.status !== 200 || !pageRes.data) {
      return { hasVideo: false, episodesCount: 0, isMovie: false };
    }

    const $ = cheerio.load(pageRes.data);

    const synopsis = $(
      '.description p, .overview p, .entry-content p, .description'
    )
      .first()
      .text()
      .trim();

    const genres: string[] = [];
    $('.genres a, .genre a, a[href*="category"]').each((_, a) => {
      const t = $(a).text().trim();
      if (t && !genres.includes(t) && t.length < 28) genres.push(t);
    });

    let rawBackdrop =
      $('.bghd img, .TPostBg img, img.TPostBg').first().attr('src') ||
      $('.bghd img, .TPostBg img, img.TPostBg').first().attr('data-src') ||
      $('a[href*="/episode/"] img').first().attr('src') ||
      $('a[href*="/episode/"] img').first().attr('data-src') ||
      '';
    if (rawBackdrop.startsWith('//')) rawBackdrop = `https:${rawBackdrop}`;
    const backdropUrl = rawBackdrop.includes('/w')
      ? rawBackdrop.replace(/\/w\d+\//, '/w1280/')
      : rawBackdrop;

    const epLinks: string[] = [];
    $('a[href*="/episode/"]').each((_, a) => {
      const h = $(a).attr('href');
      if (h && !epLinks.includes(h)) epLinks.push(h);
    });

    if (epLinks.length > 0) {
      const firstEp = normalizeToonstreamUrl(epLinks[0]);
      try {
        const epRes = await axios.get(firstEp, {
          headers: ANIME_HEADERS,
          timeout: 5000,
        });
        if (epRes.status === 200 && epRes.data) {
          const srvs = extractServersFromHtml(epRes.data);
          if (srvs.length > 0) {
            const res = {
              hasVideo: true,
              episodesCount: epLinks.length,
              isMovie: false,
              firstEpUrl: firstEp,
              backdropUrl: backdropUrl || undefined,
              synopsis: synopsis || undefined,
              genres: genres.length > 0 ? genres : undefined,
            };
            verifiedAnimeCache.set(link, { ...res, checkedAt: Date.now() });
            return res;
          }
        }
      } catch {
        // Ignore single episode timeout and continue to direct movie check
      }
    }

    // Movie Check (Direct server embed on main page)
    const directSrvs = extractServersFromHtml(pageRes.data);
    if (directSrvs.length > 0) {
      const res = {
        hasVideo: true,
        episodesCount: 1,
        isMovie: true,
        firstEpUrl: targetUrl,
        backdropUrl: backdropUrl || undefined,
        synopsis: synopsis || undefined,
        genres: genres.length > 0 ? genres : undefined,
      };
      verifiedAnimeCache.set(link, { ...res, checkedAt: Date.now() });
      return res;
    }

    verifiedAnimeCache.set(link, {
      hasVideo: false,
      episodesCount: 0,
      isMovie: false,
      checkedAt: Date.now(),
    });
    return { hasVideo: false, episodesCount: 0, isMovie: false };
  } catch {
    return { hasVideo: false, episodesCount: 0, isMovie: false };
  }
};

// Hydrate poster & stock availability for an item discovered via /search/all that wasn't in stockIndexMap yet
const hydrateSingleSeriesCard = async (
  title: string,
  urlPath: string,
  itemType: string
): Promise<StockAnimeEntry | null> => {
  const key = normalizePathKey(urlPath);
  const existing = stockIndexMap.get(key);
  if (existing && existing.images.jpg.large_image_url) {
    return existing;
  }

  const targetUrl = normalizeToonstreamUrl(urlPath);
  try {
    const pageRes = await axios.get(targetUrl, {
      headers: ANIME_HEADERS,
      timeout: 4000,
    });
    if (pageRes.status !== 200 || !pageRes.data) return null;

    const $ = cheerio.load(pageRes.data);

    // Ensure it actually has episodes or direct movie servers in stock
    const epLinksCount = $('a[href*="/episode/"]').length;
    const isMovie = itemType.toLowerCase() === 'movie' || urlPath.includes('/movies/');
    if (epLinksCount === 0 && !isMovie) {
      const srvs = extractServersFromHtml(pageRes.data);
      if (srvs.length === 0) return null;
    }

    let poster =
      $('.post-thumbnail img, .TPost img, img[src*="tmdb.org"]').first().attr('src') ||
      $('.post-thumbnail img, .TPost img').first().attr('data-src') ||
      '';
    if (poster.startsWith('//')) poster = `https:${poster}`;
    const largePoster = poster.includes('/w')
      ? poster.replace(/\/w\d+\//, '/w780/')
      : poster;

    const synopsis = $(
      '.description p, .overview p, .entry-content p, .description'
    )
      .first()
      .text()
      .trim();

    const firstEpHref = $('a[href*="/episode/"]').first().attr('href');
    const slug = urlPath.replace(/\/$/, '').split('/').pop() || '';

    const entry: StockAnimeEntry = {
      mal_id: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      slug,
      title,
      title_english: title,
      pageUrl: urlPath,
      images: {
        jpg: {
          image_url: poster,
          large_image_url: largePoster || poster,
        },
      },
      score: 8.6,
      year: 2025,
      type: isMovie ? 'Movie' : 'TV',
      isMovie,
      episodesCount: epLinksCount || 1,
      firstEpUrl: firstEpHref ? normalizeToonstreamUrl(firstEpHref) : targetUrl,
      synopsis: synopsis || undefined,
    };

    if (key) stockIndexMap.set(key, entry);
    return entry;
  } catch {
    return null;
  }
};

// Smart Stock Search Engine (supports 1-3+ character prefix, word-boundary, acronym, and typo matching)
const executeSmartStockSearch = async (rawQuery: string): Promise<StockAnimeEntry[]> => {
  const q = rawQuery.trim();
  if (!q) return [];

  const candidateMap = new Map<string, { item: StockAnimeEntry; matchScore: number }>();

  // 1. Score all pre-indexed in-stock anime instantaneously in memory
  for (const [key, entry] of stockIndexMap.entries()) {
    const vCached = verifiedAnimeCache.get(entry.pageUrl);
    if (vCached && !vCached.hasVideo) continue;

    const mScore = scoreTitleMatch(entry.title, entry.slug.replace(/-/g, ' '), q);
    if (mScore > 0) {
      const seriesBoost = entry.isMovie ? 0 : 12;
      candidateMap.set(key, {
        item: vCached
          ? {
              ...entry,
              episodesCount: vCached.episodesCount || entry.episodesCount,
              firstEpUrl: vCached.firstEpUrl || entry.firstEpUrl,
              backdropUrl: vCached.backdropUrl || entry.backdropUrl,
              synopsis: vCached.synopsis || entry.synopsis,
              genres: vCached.genres || entry.genres,
            }
          : entry,
        matchScore: mScore + seriesBoost,
      });
    }
  }

  // 2. Also query ToonStream's real JSON autocomplete endpoint (/search/all?q=...) for deep-page stock titles
  if (q.length >= 2) {
    try {
      const searchRes = await axios.get(
        `https://toonstream.vip/search/all?q=${encodeURIComponent(q)}`,
        {
          headers: { ...ANIME_HEADERS, Accept: 'application/json, text/plain, */*' },
          timeout: 3000,
        }
      );

      const remoteList: Array<{ title?: string; type?: string; url?: string }> =
        Array.isArray(searchRes.data?.data) ? searchRes.data.data : [];

      // Filter strictly by title match so description-only noise is never included
      const validRemote = remoteList
        .filter((d) => Boolean(d.title && d.url))
        .map((d) => {
          const slugText = (d.url || '').split('/').pop()?.replace(/-/g, ' ') || '';
          const mScore = scoreTitleMatch(d.title!, slugText, q);
          return { d, mScore };
        })
        .filter((x) => x.mScore > 0);

      await Promise.all(
        validRemote.slice(0, 8).map(async ({ d, mScore }) => {
          const key = normalizePathKey(d.url!);
          if (candidateMap.has(key)) return;

          const hydrated = await hydrateSingleSeriesCard(
            d.title!,
            d.url!,
            d.type || 'series'
          );
          if (hydrated) {
            candidateMap.set(key, { item: hydrated, matchScore: mScore });
          }
        })
      );
    } catch {
      // Ignore remote /search/all timeout—stockIndexMap results still resolve immediately
    }
  }

  const ranked = Array.from(candidateMap.values())
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 24)
    .map((entry) => ({
      ...entry.item,
      hasVideo: true,
    }));

  // Non-blocking background verification warm-up for top 4 hits so clicking plays immediately
  ranked.slice(0, 4).forEach((hit) => {
    verifyAnimeVideoAvailability(hit.pageUrl).catch(() => {});
  });

  return ranked;
};

// Background crawler to index the complete ToonStream TV series & movies stock on startup
const warmStockIndex = async () => {
  const urlsToIndex: string[] = [];
  for (let p = 1; p <= 50; p++) {
    urlsToIndex.push(
      p === 1
        ? 'https://toonstream.vip/series'
        : `https://toonstream.vip/series/page/${p}`
    );
  }
  for (let p = 1; p <= 12; p++) {
    urlsToIndex.push(`https://toonstream.vip/category/anime?type=movies&page=${p}`);
  }
  for (let p = 1; p <= 5; p++) {
    urlsToIndex.push(
      p === 1
        ? 'https://toonstream.vip/category/hindi-dubbed/'
        : `https://toonstream.vip/category/hindi-dubbed/page/${p}/`
    );
  }

  for (let i = 0; i < urlsToIndex.length; i += 10) {
    const batch = urlsToIndex.slice(i, i + 10);
    await Promise.allSettled(
      batch.map(async (url) => {
        const res = await axios.get(url, { headers: ANIME_HEADERS, timeout: 8000 });
        if (res.status === 200 && res.data) {
          parseArticlesFromHtml(res.data);
        }
      })
    );
  }
};

const enrichWithVerifiedCache = (items: StockAnimeEntry[]): StockAnimeEntry[] => {
  const out: StockAnimeEntry[] = [];
  for (const item of items) {
    if (!item.images?.jpg?.large_image_url && !item.images?.jpg?.image_url) {
      continue;
    }
    const v = verifiedAnimeCache.get(item.pageUrl);
    if (v && !v.hasVideo) continue;
    if (v) {
      out.push({
        ...item,
        isMovie: v.isMovie,
        episodesCount: v.episodesCount || item.episodesCount,
        firstEpUrl: v.firstEpUrl || item.firstEpUrl,
        backdropUrl: v.backdropUrl || item.backdropUrl,
        synopsis: v.synopsis || item.synopsis,
        genres: v.genres || item.genres,
      });
    } else {
      out.push(item);
    }
  }
  return out;
};

const fetchCatalogPageSafe = async (url: string): Promise<StockAnimeEntry[]> => {
  try {
    const res = await axios.get(url, {
      httpsAgent: keepAliveHttpsAgent,
      headers: ANIME_HEADERS,
      timeout: 8000,
    });
    if (res.status === 200 && res.data) {
      return parseArticlesFromHtml(res.data);
    }
    return [];
  } catch {
    return [];
  }
};

const buildHomeCatalogPools = async (): Promise<HomeCatalogPools> => {
  if (
    homeCatalogCache &&
    Date.now() - homeCatalogCache.cachedAt < HOME_CATALOG_TTL
  ) {
    return homeCatalogCache.pools;
  }

  if (homeCatalogInFlight) {
    return homeCatalogInFlight;
  }

  homeCatalogInFlight = (async () => {
    try {
      const [
        animeP1,
        animeP2,
        hindiP1,
        seriesP2,
        seriesP3,
        seriesP4,
        seriesP5,
        actionP1,
        actionP2,
        actionP3,
        actionP4,
        fantasyP1,
        fantasyP2,
        fantasyP3,
        fantasyP4,
        fantasyP5,
        mysteryP1,
        mysteryP2,
        mysteryP3,
        scifiP1,
        scifiP2,
        moviesP1,
        moviesP2,
        moviesP3,
        seriesP6,
        seriesP7,
        seriesP8,
        seriesP9,
      ] = await Promise.all([
        fetchCatalogPageSafe('https://toonstream.vip/category/anime?type=all&page=1'),
        fetchCatalogPageSafe('https://toonstream.vip/category/anime?type=all&page=2'),
        fetchCatalogPageSafe('https://toonstream.vip/category/hindi-dubbed/'),
        fetchCatalogPageSafe('https://toonstream.vip/series/page/2'),
        fetchCatalogPageSafe('https://toonstream.vip/series/page/3'),
        fetchCatalogPageSafe('https://toonstream.vip/series/page/4'),
        fetchCatalogPageSafe('https://toonstream.vip/series/page/5'),
        fetchCatalogPageSafe('https://toonstream.vip/category/action?type=series&page=1'),
        fetchCatalogPageSafe('https://toonstream.vip/category/action?type=series&page=2'),
        fetchCatalogPageSafe('https://toonstream.vip/category/action?type=series&page=3'),
        fetchCatalogPageSafe('https://toonstream.vip/category/action?type=series&page=4'),
        fetchCatalogPageSafe('https://toonstream.vip/category/fantasy?type=series&page=1'),
        fetchCatalogPageSafe('https://toonstream.vip/category/fantasy?type=series&page=2'),
        fetchCatalogPageSafe('https://toonstream.vip/category/fantasy?type=series&page=3'),
        fetchCatalogPageSafe('https://toonstream.vip/category/fantasy?type=series&page=4'),
        fetchCatalogPageSafe('https://toonstream.vip/category/fantasy?type=series&page=5'),
        fetchCatalogPageSafe('https://toonstream.vip/category/mystery?type=series&page=1'),
        fetchCatalogPageSafe('https://toonstream.vip/category/mystery?type=series&page=2'),
        fetchCatalogPageSafe('https://toonstream.vip/category/mystery?type=series&page=3'),
        fetchCatalogPageSafe('https://toonstream.vip/category/sci-fi-fantasy?type=series&page=1'),
        fetchCatalogPageSafe('https://toonstream.vip/category/sci-fi-fantasy?type=series&page=2'),
        fetchCatalogPageSafe('https://toonstream.vip/category/anime?type=movies&page=1'),
        fetchCatalogPageSafe('https://toonstream.vip/category/anime?type=movies&page=2'),
        fetchCatalogPageSafe('https://toonstream.vip/category/anime?type=movies&page=3'),
        fetchCatalogPageSafe('https://toonstream.vip/series/page/6'),
        fetchCatalogPageSafe('https://toonstream.vip/series/page/7'),
        fetchCatalogPageSafe('https://toonstream.vip/series/page/8'),
        fetchCatalogPageSafe('https://toonstream.vip/series/page/9'),
      ]);

      // Deep-verify the top 10 items from Page 1 so the Hero Banner always has backdropUrl, synopsis & genres
      const verifiedHeroPool: StockAnimeEntry[] = [];
      const topCandidates = animeP1.slice(0, 10);
      const heroResults = await Promise.all(
        topCandidates.map(async (item) => {
          const v = await verifyAnimeVideoAvailability(item.pageUrl);
          return v.hasVideo
            ? {
                ...item,
                isMovie: v.isMovie,
                episodesCount: v.episodesCount,
                firstEpUrl: v.firstEpUrl,
                backdropUrl: v.backdropUrl,
                synopsis: v.synopsis,
                genres: v.genres,
              }
            : null;
        })
      );
      heroResults.forEach((r) => r && verifiedHeroPool.push(r));

      const pools: HomeCatalogPools = {
        hero:
          verifiedHeroPool.length > 0
            ? verifiedHeroPool
            : enrichWithVerifiedCache(animeP1.slice(0, 10)),
        trending: enrichWithVerifiedCache([...animeP1, ...animeP2]),
        hindi_dubbed: enrichWithVerifiedCache([...hindiP1, ...seriesP2, ...seriesP3]),
        popular: enrichWithVerifiedCache([...animeP2, ...seriesP4, ...seriesP5]),
        action: enrichWithVerifiedCache([
          ...actionP1,
          ...actionP2,
          ...actionP3,
          ...actionP4,
        ]),
        fantasy: enrichWithVerifiedCache([
          ...fantasyP1,
          ...fantasyP2,
          ...fantasyP3,
          ...fantasyP4,
          ...fantasyP5,
        ]),
        scifi: enrichWithVerifiedCache([
          ...mysteryP1,
          ...mysteryP2,
          ...mysteryP3,
          ...scifiP1,
          ...scifiP2,
        ]),
        movies: enrichWithVerifiedCache([...moviesP1, ...moviesP2, ...moviesP3]),
        extra: enrichWithVerifiedCache([
          ...seriesP6,
          ...seriesP7,
          ...seriesP8,
          ...seriesP9,
        ]),
      };

      const totalLoaded =
        pools.hero.length +
        pools.trending.length +
        pools.action.length +
        pools.movies.length;
      if (totalLoaded > 0) {
        homeCatalogCache = { pools, cachedAt: Date.now() };
      }

      return pools;
    } finally {
      homeCatalogInFlight = null;
    }
  })();

  return homeCatalogInFlight;
};

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Multi-Section Diverse Home Catalog Endpoint (/api/toonstream/home-catalog)
  app.get('/api/toonstream/home-catalog', async (_req: Request, res: Response) => {
    try {
      const pools = await buildHomeCatalogPools();
      res.json({ success: true, pools });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load home catalog';
      res.json({ success: false, error: message });
    }
  });

  // Dedicated Instant Smart Stock Search Endpoint (/api/toonstream/search?q=...)
  app.get('/api/toonstream/search', async (req: Request, res: Response) => {
    try {
      const q = ((req.query.q as string) || '').trim();
      if (!q) {
        res.json({ success: true, animes: [] });
        return;
      }
      const animes = await executeSmartStockSearch(q);
      res.json({ success: true, query: q, animes });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search failed';
      res.json({ success: false, error: message, animes: [] });
    }
  });

  // D. Feed Scraper with 780p Poster Upscaling
  app.get('/api/toonstream/feed', async (req: Request, res: Response) => {
    try {
      const page = parseInt((req.query.page as string) || '1', 10);
      const category = (req.query.category as string) || 'anime';
      const search = ((req.query.search as string) || '').trim();

      if (search) {
        const matched = await executeSmartStockSearch(search);
        res.json({ success: true, page: 1, animes: matched });
        return;
      }

      const cacheKey = `${category}::${page}`;
      const cachedFeed = feedCache.get(cacheKey);
      if (cachedFeed && Date.now() - cachedFeed.cachedAt < FEED_TTL) {
        res.json({ success: true, page, animes: cachedFeed.animes });
        return;
      }

      const fetchUrl =
        category === 'hindi-dubbed'
          ? page === 1
            ? 'https://toonstream.vip/category/hindi-dubbed/'
            : `https://toonstream.vip/category/hindi-dubbed/page/${page}/`
          : category === 'movies'
          ? `https://toonstream.vip/category/anime?type=movies&page=${page}`
          : `https://toonstream.vip/category/anime?type=all&page=${page}`;

      const response = await axios.get(fetchUrl, {
        headers: ANIME_HEADERS,
        timeout: 10000,
      });

      const rawAnimes = parseArticlesFromHtml(response.data);

      const verifiedAnimes: unknown[] = [];
      for (let i = 0; i < rawAnimes.length; i += 6) {
        const chunk = rawAnimes.slice(i, i + 6);
        const results = await Promise.all(
          chunk.map(async (item) => {
            const v = await verifyAnimeVideoAvailability(item.pageUrl);
            return v.hasVideo
              ? {
                  ...item,
                  hasVideo: true,
                  isMovie: v.isMovie,
                  episodesCount: v.episodesCount,
                  firstEpUrl: v.firstEpUrl,
                  backdropUrl: v.backdropUrl,
                  synopsis: v.synopsis,
                  genres: v.genres,
                }
              : null;
          })
        );
        results.forEach((item) => item && verifiedAnimes.push(item));
      }

      if (verifiedAnimes.length > 0) {
        feedCache.set(cacheKey, { animes: verifiedAnimes, cachedAt: Date.now() });
      }

      res.json({ success: true, page, animes: verifiedAnimes });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch feed';
      res.json({ success: false, error: message, animes: [] });
    }
  });

  // E. Series Details & Complete Multi-Season Scraping (/api/toonstream/series)
  app.get('/api/toonstream/series', async (req: Request, res: Response) => {
    try {
      const urlPath = (req.query.url as string) || '';
      if (!urlPath) {
        res.json({ success: false, error: 'Missing url parameter', episodes: [] });
        return;
      }

      const cacheKey = normalizePathKey(urlPath);
      const cachedSeries = seriesDetailsCache.get(cacheKey);
      if (cachedSeries && Date.now() - cachedSeries.cachedAt < SERIES_TTL) {
        res.json({
          success: true,
          title: cachedSeries.title,
          synopsis: cachedSeries.synopsis,
          genres: cachedSeries.genres,
          isMovie: cachedSeries.isMovie,
          episodesCount: cachedSeries.episodesCount,
          episodes: cachedSeries.episodes,
        });
        return;
      }

      const targetUrl = normalizeToonstreamUrl(urlPath).replace(/\/$/, '');
      const response = await axios.get(targetUrl, {
        headers: ANIME_HEADERS,
        timeout: 10000,
      });
      const $ = cheerio.load(response.data);

      const title = $('h1')
        .first()
        .text()
        .replace(/SCHEDULE.*$/i, '')
        .trim();
      const synopsis = $(
        '.description p, .overview p, .entry-content p, .description'
      )
        .first()
        .text()
        .trim();

      const genres: string[] = [];
      $('.genres a, .genre a, a[href*="category"]').each((_, a) => {
        const t = $(a).text().trim();
        if (t && !genres.includes(t) && t.length < 28) genres.push(t);
      });

      const episodes: ScrapedEpisode[] = [];
      const seenSeasonUrls = new Set<string>();
      const usedSeasonEpNumbers = new Map<number, Set<number>>();

      const parseEpisodeAnchors = (
        root: cheerio.CheerioAPI,
        explicitSeason?: number,
        scopeSelector?: string
      ) => {
        const anchors = scopeSelector
          ? root(scopeSelector).find('a[href*="/episode/"]')
          : root('a[href*="/episode/"]');

        anchors.each((_, a) => {
          const rawHref = root(a).attr('href') || '';
          if (!rawHref) return;

          const normHrefKey = normalizePathKey(rawHref);
          const container = root(a).closest('article, li');
          const numEpiText =
            container.find('.num-epi').first().text().trim() ||
            root(a).find('.num-epi').first().text().trim();

          const sxEpFromUrl = rawHref.match(/(\d+)x(\d+)/i);
          const sxEpFromBadge = numEpiText.match(/(\d+)x(\d+)/i);
          const epOnlyMatch = rawHref.match(/episode-(\d+)/i);

          const seasonNum =
            typeof explicitSeason === 'number' && !Number.isNaN(explicitSeason)
              ? explicitSeason
              : sxEpFromUrl
              ? parseInt(sxEpFromUrl[1], 10)
              : sxEpFromBadge
              ? parseInt(sxEpFromBadge[1], 10)
              : 1;

          const dedupeKey = `${seasonNum}::${normHrefKey}`;
          if (seenSeasonUrls.has(dedupeKey)) return;
          seenSeasonUrls.add(dedupeKey);

          const usedNums = usedSeasonEpNumbers.get(seasonNum) || new Set<number>();
          let epNum = sxEpFromUrl
            ? parseInt(sxEpFromUrl[2], 10)
            : sxEpFromBadge
            ? parseInt(sxEpFromBadge[2], 10)
            : epOnlyMatch
            ? parseInt(epOnlyMatch[1], 10)
            : usedNums.size + 1;

          while (usedNums.has(epNum) || epNum <= 0) {
            epNum += 1;
          }
          usedNums.add(epNum);
          usedSeasonEpNumbers.set(seasonNum, usedNums);

          const rawCardTitle =
            container.find('.entry-title, h2').first().text().trim() ||
            root(a).find('.entry-title, h2').first().text().trim();

          episodes.push({
            id: seasonNum * 10000 + epNum,
            season: seasonNum,
            episode: epNum,
            title:
              rawCardTitle && rawCardTitle.length > 0 && rawCardTitle !== numEpiText
                ? rawCardTitle
                : `Episode ${epNum}`,
            url: rawHref,
          });
        });
      };

      // Discover all available seasons on ToonStream (.season-btn[data-season][data-url])
      interface SeasonTabInfo {
        season: number;
        seasonUrl: string;
        isActive: boolean;
      }

      const seasonTabs: SeasonTabInfo[] = [];
      $('a.season-btn, .season-btn, [data-season]').each((_, el) => {
        const rawSeason = $(el).attr('data-season');
        if (rawSeason === undefined || rawSeason === '') return;
        const sNum = parseInt(rawSeason, 10);
        if (Number.isNaN(sNum) || sNum < 0) return;
        if (seasonTabs.some((st) => st.season === sNum)) return;

        const dataUrl =
          $(el).attr('data-url') || `${urlPath.replace(/\/$/, '')}/season/${sNum}`;
        const isActive = $(el).hasClass('active');
        seasonTabs.push({
          season: sNum,
          seasonUrl: normalizeToonstreamUrl(dataUrl),
          isActive,
        });
      });

      if (seasonTabs.length > 0) {
        // 1. Parse whichever season tab is already rendered in #episode_by_temp on the main HTML
        const activeTab = seasonTabs.find((t) => t.isActive);
        if (activeTab && $('#episode_by_temp a[href*="/episode/"]').length > 0) {
          parseEpisodeAnchors($, activeTab.season, '#episode_by_temp');
        }

        // 2. Fetch all other seasons in fast parallel batches via ToonStream's XHR season endpoint
        const remainingTabs = seasonTabs.filter(
          (t) => !episodes.some((e) => e.season === t.season)
        );

        for (let i = 0; i < remainingTabs.length; i += 8) {
          const batch = remainingTabs.slice(i, i + 8);
          await Promise.allSettled(
            batch.map(async (tab) => {
              const sRes = await axios.get(tab.seasonUrl, {
                headers: {
                  ...ANIME_HEADERS,
                  'X-Requested-With': 'XMLHttpRequest',
                  Referer: targetUrl,
                },
                timeout: 7000,
              });
              if (sRes.status === 200 && sRes.data) {
                const $s = cheerio.load(sRes.data);
                parseEpisodeAnchors($s, tab.season);
              }
            })
          );
        }

        // Fallback if #episode_by_temp selector differed on an unusual page
        if (episodes.length === 0) {
          parseEpisodeAnchors($, seasonTabs[0].season);
        }
      } else {
        // Single-season series or movie without .season-btn tabs
        parseEpisodeAnchors($);
      }

      episodes.sort((a, b) =>
        a.season !== b.season ? a.season - b.season : a.episode - b.episode
      );

      let isMovie = false;
      if (episodes.length === 0) {
        const directServers = extractServersFromHtml(response.data);
        if (directServers.length > 0) {
          isMovie = true;
          episodes.push({
            id: 1,
            season: 1,
            episode: 1,
            title: 'Full Movie',
            url: targetUrl,
          });
        }
      }

      if (episodes.length > 0 && cacheKey) {
        seriesDetailsCache.set(cacheKey, {
          title,
          synopsis,
          genres,
          isMovie,
          episodesCount: episodes.length,
          episodes,
          cachedAt: Date.now(),
        });
      }

      res.json({
        success: true,
        title,
        synopsis,
        genres,
        isMovie,
        episodesCount: episodes.length,
        episodes,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load series';
      res.json({ success: false, error: message, episodes: [] });
    }
  });

  // G. Zero-Ad Native HLS Master Entry for FirePlayer (auto-refreshes token if expired)
  app.get('/api/stream/fireplayer.m3u8', async (req: Request, res: Response) => {
    try {
      const embedUrl = (req.query.embed as string) || '';
      if (!embedUrl.startsWith('http')) {
        res.status(400).send('Invalid embed parameter');
        return;
      }

      const token = await resolveFirePlayerToken(embedUrl);
      if (!token) {
        res.status(502).send('Unable to resolve stream token');
        return;
      }

      const m3u8Res = await axios.get(token.masterUrl, {
        httpsAgent: keepAliveHttpsAgent,
        timeout: 7000,
        responseType: 'text',
        headers: {
          'User-Agent': ANIME_HEADERS['User-Agent'],
          Referer: `${token.refOrigin}/`,
          Origin: token.refOrigin,
        },
      });

      const rewritten = rewriteHlsPlaylist(
        String(m3u8Res.data),
        token.masterUrl,
        token.refOrigin
      );

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      res.send(rewritten);
    } catch {
      res.status(502).send('Failed to load master playlist');
    }
  });

  // H. HLS Variant / Audio Playlist Rewriter Proxy
  app.get('/api/stream/m3u8', async (req: Request, res: Response) => {
    try {
      const targetUrl = (req.query.url as string) || '';
      const refOrigin = (req.query.ref as string) || 'https://ravok.buzz';
      if (!targetUrl.startsWith('http')) {
        res.status(400).send('Invalid playlist URL');
        return;
      }

      const m3u8Res = await axios.get(targetUrl, {
        httpsAgent: keepAliveHttpsAgent,
        timeout: 8000,
        responseType: 'text',
        headers: {
          'User-Agent': ANIME_HEADERS['User-Agent'],
          Referer: `${refOrigin.replace(/\/$/, '')}/`,
          Origin: refOrigin.replace(/\/$/, ''),
        },
      });

      const rewritten = rewriteHlsPlaylist(
        String(m3u8Res.data),
        targetUrl,
        refOrigin.replace(/\/$/, '')
      );

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(rewritten);
    } catch {
      res.status(502).send('Failed to load variant playlist');
    }
  });

  // I. High-Throughput Keep-Alive Media Segment Proxy (strips disguised .js/.css extensions -> video/mp2t)
  app.get('/api/stream/seg', async (req: Request, res: Response) => {
    try {
      const targetUrl = (req.query.url as string) || '';
      const refOrigin = (req.query.ref as string) || 'https://ravok.buzz';
      if (!targetUrl.startsWith('http')) {
        res.status(400).end();
        return;
      }

      const reqHeaders: Record<string, string> = {
        'User-Agent': ANIME_HEADERS['User-Agent'],
        Referer: `${refOrigin.replace(/\/$/, '')}/`,
        Origin: refOrigin.replace(/\/$/, ''),
      };
      if (typeof req.headers.range === 'string') {
        reqHeaders.Range = req.headers.range;
      }

      const upstream = await axios.get(targetUrl, {
        httpsAgent: keepAliveHttpsAgent,
        timeout: 12000,
        responseType: 'stream',
        headers: reqHeaders,
        validateStatus: (s) => s >= 200 && s < 400,
      });

      res.status(upstream.status);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (upstream.headers['content-length']) {
        res.setHeader('Content-Length', String(upstream.headers['content-length']));
      }
      if (upstream.headers['content-range']) {
        res.setHeader('Content-Range', String(upstream.headers['content-range']));
      }

      req.on('close', () => {
        if (!res.writableEnded) {
          upstream.data.destroy();
        }
      });

      upstream.data.on('error', () => {
        if (!res.writableEnded) res.end();
      });

      upstream.data.pipe(res);
    } catch {
      if (!res.headersSent) res.status(502).end();
    }
  });

  // J. WebVTT Subtitle Proxy (handles disguised .jpg/.vtt subtitle files)
  app.get('/api/stream/vtt', async (req: Request, res: Response) => {
    try {
      const targetUrl = (req.query.url as string) || '';
      const refOrigin = (req.query.ref as string) || 'https://ravok.buzz';
      if (!targetUrl.startsWith('http')) {
        res.status(400).end();
        return;
      }

      const vttRes = await axios.get(targetUrl, {
        httpsAgent: keepAliveHttpsAgent,
        timeout: 6000,
        responseType: 'text',
        headers: {
          'User-Agent': ANIME_HEADERS['User-Agent'],
          Referer: `${refOrigin.replace(/\/$/, '')}/`,
          Origin: refOrigin.replace(/\/$/, ''),
        },
      });

      let body = String(vttRes.data || '');
      if (!body.trimStart().startsWith('WEBVTT')) {
        body = `WEBVTT\n\n${body}`;
      }
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(body);
    } catch {
      res.status(502).end();
    }
  });

  // K. Clean Ad-Scrubbed HTML Embed Proxy for Backup Servers
  app.get('/api/stream/clean-embed', async (req: Request, res: Response) => {
    try {
      const targetUrl = (req.query.url as string) || '';
      if (!targetUrl.startsWith('http')) {
        res.status(400).send('Invalid embed URL');
        return;
      }

      const htmlRes = await axios.get(targetUrl, {
        httpsAgent: keepAliveHttpsAgent,
        timeout: 7000,
        responseType: 'text',
        headers: {
          'User-Agent': ANIME_HEADERS['User-Agent'],
          Referer: 'https://toonstream.us/',
        },
      });

      const scrubbed = scrubEmbedHtmlAds(String(htmlRes.data || ''), targetUrl);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(scrubbed);
    } catch {
      res.redirect((req.query.url as string) || 'about:blank');
    }
  });

  // F. Episode Stream Resolver (/api/toonstream/episode) — Prioritizes 100% Ad-Free Native HLS/MP4 Streams
  app.get('/api/toonstream/episode', async (req: Request, res: Response) => {
    const episodeUrl = (req.query.episodeUrl as string) || '';
    if (!episodeUrl) {
      res.json({ success: false, error: 'Missing episodeUrl', servers: [] });
      return;
    }

    const targetUrl = normalizeToonstreamUrl(episodeUrl);
    const cacheKey = normalizePathKey(targetUrl);
    const cachedEp = episodeServersCache.get(cacheKey);
    if (cachedEp && Date.now() - cachedEp.cachedAt < EPISODE_TTL) {
      res.json({ success: true, directUrl: targetUrl, servers: cachedEp.servers });
      return;
    }

    try {
      const pageRes = await axios.get(targetUrl, {
        httpsAgent: keepAliveHttpsAgent,
        headers: ANIME_HEADERS,
        timeout: 7000,
      });

      const rawIframeServers = extractServersFromHtml(pageRes.data);

      // Identify candidates for direct native extraction (FirePlayer HLS + Blakite Rumble CDN)
      const fireCandidate = rawIframeServers.find((s) => {
        const u = s.url.toLowerCase();
        return (
          u.includes('ravok.buzz') ||
          u.includes('vexal') ||
          u.includes('zephyrflick') ||
          u.includes('raretoonsindia')
        );
      });
      const blakiteCandidate = rawIframeServers.find((s) =>
        s.url.toLowerCase().includes('blakiteapi')
      );

      const [fireResolved, blakiteResolved] = await Promise.all([
        fireCandidate ? resolveFirePlayerToken(fireCandidate.url) : Promise.resolve(null),
        blakiteCandidate
          ? resolveBlakiteDirectStream(blakiteCandidate.url)
          : Promise.resolve(null),
      ]);

      const finalServers: ServerLink[] = [];

      // 1. Primary Native Multi-Audio 1080p HLS Stream (0% Ads, Native HTML5 + hls.js)
      if (fireCandidate && fireResolved) {
        finalServers.push({
          name: 'HD Player',
          url: `/api/stream/fireplayer.m3u8?embed=${encodeURIComponent(fireCandidate.url)}`,
          kind: 'hls',
          subtitles: fireResolved.subtitles,
        });
      }

      // 2. Secondary Native Direct Rumble Cloud CDN Stream (0% Ads, Instant MP4/HLS)
      if (blakiteResolved) {
        finalServers.push(blakiteResolved);
      }

      // 3. Verified Backup Embed Servers (Ad-Scrubbed where supported, anti-sandbox aware)
      for (const srv of rawIframeServers) {
        const lower = srv.url.toLowerCase();
        // Skip broken filesforever embeds if we already have native or clean servers
        if (lower.includes('filesforever') && finalServers.length >= 2) {
          continue;
        }

        if (lower.includes('blakiteapi')) {
          finalServers.push({
            name: srv.name || 'MultiQ',
            url: `/api/stream/clean-embed?url=${encodeURIComponent(srv.url)}`,
            kind: 'iframe',
            allowSandbox: true,
          });
        } else if (lower.includes('ravok.buzz')) {
          finalServers.push({
            name: srv.name || 'Play Backup',
            url: srv.url,
            kind: 'iframe',
            allowSandbox: true,
          });
        } else {
          finalServers.push({
            name: srv.name,
            url: srv.url,
            kind: 'iframe',
            allowSandbox: srv.allowSandbox !== false,
          });
        }
      }

      if (finalServers.length > 0 && cacheKey) {
        episodeServersCache.set(cacheKey, {
          servers: finalServers,
          cachedAt: Date.now(),
        });
      }

      res.json({ success: true, directUrl: targetUrl, servers: finalServers });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resolve episode';
      res.json({ success: false, error: message, directUrl: targetUrl, servers: [] });
    }
  });

  // API 404 handler (prevents returning index.html for invalid API calls)
  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  });

  const distPath = path.resolve(__dirname, 'dist');
  const indexPath = path.resolve(distPath, 'index.html');
  const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(indexPath);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(indexPath);
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`One Yesly server running on http://0.0.0.0:${PORT} in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
    // Pre-warm home sections & ToonStream's stock catalog asynchronously in the background
    buildHomeCatalogPools().catch(() => {});
    warmStockIndex().catch(() => {});
  });
}

startServer();
