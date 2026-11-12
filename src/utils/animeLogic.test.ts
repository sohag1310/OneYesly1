/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PosterDeduplicator } from './posterDedupe';
import { scoreTitleMatch } from './searchMatch';
import { AnimeItem, StreamServer } from '../types/anime';

test('PosterDeduplicator prevents duplicate IDs and duplicate normalized URLs', () => {
  const dedupe = new PosterDeduplicator();

  const item1 = {
    id: 'anime-1',
    title: 'One Piece',
    posterUrl: 'https://image.tmdb.org/t/p/w500/one-piece.jpg?v=1',
  } as AnimeItem;

  const item2WithSameUrl = {
    id: 'anime-2',
    title: 'One Piece Red',
    posterUrl: 'https://image.tmdb.org/t/p/w300/one-piece.jpg?v=2',
  } as AnimeItem;

  const item3Unique = {
    id: 'anime-3',
    title: 'Bleach',
    posterUrl: 'https://image.tmdb.org/t/p/w500/bleach.jpg',
  } as AnimeItem;

  const unique = dedupe.takeUnique([item1, item2WithSameUrl, item3Unique], 5);
  assert.equal(unique.length, 2, 'Should discard duplicate poster URL variant');
  assert.equal(unique[0].id, 'anime-1');
  assert.equal(unique[1].id, 'anime-3');
});

test('Stream filtering discards dummy fallback videos and identifies visible servers', () => {
  const dummyServer = {
    name: 'HD Player (Backup)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    kind: 'mp4' as const,
  };

  const hdPlayer = {
    name: 'HD Player',
    url: '/api/stream/fireplayer.m3u8?embed=https%3A%2F%2Fravok.buzz%2Fvideo%2F123',
    kind: 'hls' as const,
  };

  const multiAudio = {
    name: 'Multi-Audio',
    url: '/api/stream/fireplayer.m3u8?embed=https%3A%2F%2Fravok.buzz%2Fvideo%2F123',
    kind: 'hls' as const,
  };

  const backgroundServer = {
    name: 'Background Stream',
    url: 'https://hugh.cdn.rumble.cloud/video/fwe2/COPfA.caa.tar?r_file=chunklist.m3u8',
    kind: 'hls' as const,
    isBackgroundOnly: true,
  };

  const iframeServer = {
    name: 'Server 1 Ruby',
    url: 'https://rubystm.com/e/iqz0fzezotl6.html',
    kind: 'iframe' as const,
  };

  const rawList: StreamServer[] = [dummyServer, hdPlayer, multiAudio, backgroundServer, iframeServer];
  const realOnly = rawList.filter((s) => !s.url.includes('commondatastorage.googleapis.com'));

  assert.equal(realOnly.length, 4);

  // Visible servers: exclude background-only and Fast Stream
  const visible = realOnly.filter(
    (s) =>
      !s.isBackgroundOnly &&
      !s.name.toLowerCase().includes('fast stream') &&
      !s.name.toLowerCase().includes('background')
  );

  assert.equal(visible.length, 3);
  assert.equal(visible[0].name, 'HD Player');
  assert.equal(visible[1].name, 'Multi-Audio');
  assert.equal(visible[2].name, 'Server 1 Ruby');
});

test('scoreTitleMatch accurately scores exact, prefix, word, and acronym matches', () => {
  // Tier 1: exact match
  assert.equal(scoreTitleMatch('Attack on Titan', 'shingeki-no-kyojin', 'attack on titan'), 100);

  // Tier 2: starts with query
  assert.equal(scoreTitleMatch('Attack on Titan Season 2', 'shingeki-no-kyojin-s2', 'attack on titan'), 90);

  // Tier 4: acronym match (aot -> Attack on Titan)
  assert.equal(scoreTitleMatch('Attack on Titan', 'shingeki-no-kyojin', 'aot'), 70);

  // Non-matching query returns 0
  assert.equal(scoreTitleMatch('Naruto Shippuden', 'naruto', 'dragon ball'), 0);
});

test('Toonplay streaming engine normalizes slugs and builds deterministic fallback URLs', async () => {
  const { cleanAnimeSlug, getDeterministicStreamUrl } = await import('./toonplayEngine.ts');

  // Slug cleaning checks
  assert.equal(cleanAnimeSlug('Solo Leveling'), 'solo-leveling');
  assert.equal(cleanAnimeSlug('/series/solo-leveling/'), 'solo-leveling');
  assert.equal(cleanAnimeSlug('series-solo-leveling'), 'solo-leveling');
  assert.equal(cleanAnimeSlug('rezero-starting-life-in-another-world'), 're-zero-starting-life-in-another-world');
  assert.equal(cleanAnimeSlug('ts-naruto'), 'naruto');

  // Series deterministic stream URL
  const seriesUrl = getDeterministicStreamUrl({
    slug: 'solo-leveling',
    season: 1,
    ep: 3,
    lang: 'hin',
    isMovie: false,
  });
  assert.equal(
    seriesUrl,
    'https://toonplay.in/watch/series-solo-leveling?season=1&ep=3&server=multi-1&lang=hin'
  );

  // Movie deterministic stream URL
  const movieUrl = getDeterministicStreamUrl({
    slug: 'suzume',
    season: 1,
    ep: 1,
    lang: 'eng',
    isMovie: true,
  });
  assert.equal(
    movieUrl,
    'https://toonplay.in/watch/movies-suzume?season=1&ep=1&server=multi-1&lang=eng'
  );
});


