import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { AnimeItem, Season } from '../types/anime';
import {
  fetchToonstreamSeriesDetails,
  searchLiveAnime,
} from '../data/animeCatalog';
import { VideoPlayer } from './VideoPlayer';
import { AnimePoster } from './AnimePoster';
import { AnimeCard } from './AnimeCard';

interface WatchViewProps {
  anime: AnimeItem;
  seasonNumber: number;
  episodeNumber: number;
  onChangeSeason: (seasonNum: number, initialEpisodeNum?: number) => void;
  onChangeEpisode: (episodeNum: number) => void;
  watchedSet: Set<string>;
  isFavorite: boolean;
  onToggleFavorite: (animeId: string, e?: React.MouseEvent) => void;
  recommendedAnime: AnimeItem[];
  onSelectAnime: (anime: AnimeItem) => void;
  onBackHome: () => void;
}

export const WatchView: React.FC<WatchViewProps> = ({
  anime,
  seasonNumber,
  episodeNumber,
  onChangeSeason,
  onChangeEpisode,
  watchedSet,
  isFavorite,
  onToggleFavorite,
  recommendedAnime,
  onSelectAnime,
  onBackHome,
}) => {
  const [resolvedSeasons, setResolvedSeasons] = useState<Season[] | null>(null);
  const [resolvedSynopsis, setResolvedSynopsis] = useState<string | null>(null);
  const [resolvedGenres, setResolvedGenres] = useState<string[] | null>(null);
  const [resolvedPageUrl, setResolvedPageUrl] = useState<string | undefined>(
    anime.pageUrl
  );
  const [isResolvingSeries, setIsResolvingSeries] = useState<boolean>(false);

  // Scrape all real seasons & episodes from /api/toonstream/series
  useEffect(() => {
    let active = true;
    setResolvedSeasons(null);
    setResolvedSynopsis(null);
    setResolvedGenres(null);
    setResolvedPageUrl(anime.pageUrl);

    const resolveSeries = async () => {
      setIsResolvingSeries(true);
      try {
        let targetAnime = anime;

        if (!targetAnime.pageUrl) {
          const matches = await searchLiveAnime(targetAnime.title);
          const tsMatch = matches.find((m) => Boolean(m.pageUrl));
          if (tsMatch && active) {
            targetAnime = tsMatch;
            setResolvedPageUrl(tsMatch.pageUrl);
          }
        }

        if (targetAnime.pageUrl) {
          const scraped = await fetchToonstreamSeriesDetails(targetAnime);
          if (active && scraped && scraped.seasons.length > 0) {
            setResolvedSeasons(scraped.seasons);
            if (scraped.synopsis) setResolvedSynopsis(scraped.synopsis);
            if (scraped.genres && scraped.genres.length > 0) {
              setResolvedGenres(scraped.genres);
            }
          }
        }
      } finally {
        if (active) setIsResolvingSeries(false);
      }
    };

    resolveSeries();
    return () => {
      active = false;
    };
  }, [anime.id, anime.pageUrl, anime.title]);

  // Reconcile active season & episode number once real multi-season episodes finish loading
  useEffect(() => {
    if (!resolvedSeasons || resolvedSeasons.length === 0) return;

    const matchedSeason = resolvedSeasons.find(
      (s) => s.seasonNumber === seasonNumber
    );
    if (!matchedSeason) {
      const firstSeason = resolvedSeasons[0];
      const firstEp = firstSeason.episodes[0]?.number ?? 1;
      onChangeSeason(firstSeason.seasonNumber, firstEp);
      return;
    }

    const hasMatchedEpisode = matchedSeason.episodes.some(
      (ep) => ep.number === episodeNumber
    );
    if (!hasMatchedEpisode && matchedSeason.episodes.length > 0) {
      onChangeEpisode(matchedSeason.episodes[0].number);
    }
  }, [resolvedSeasons, seasonNumber, episodeNumber, onChangeSeason, onChangeEpisode]);

  const activeSeasons = resolvedSeasons || anime.seasons;
  const activeSynopsis = resolvedSynopsis || anime.synopsis;
  const activeGenres = resolvedGenres || anime.genres;

  const currentSeasonIndex = Math.max(
    0,
    activeSeasons.findIndex((s) => s.seasonNumber === seasonNumber)
  );
  const fallbackEpisode: Episode = {
    number: 1,
    title: 'Episode 1',
    duration: '24:00',
    durationSeconds: 1440,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    synopsis: activeSynopsis,
  };

  const safeSeason = currentSeason || {
    seasonNumber: 1,
    name: 'Season 1',
    year: anime.year || 2024,
    episodes: [fallbackEpisode],
  };

  const safeEpisodes = safeSeason.episodes && safeSeason.episodes.length > 0
    ? safeSeason.episodes
    : [fallbackEpisode];

  const currentEpisode =
    safeEpisodes.find((ep) => ep.number === episodeNumber) ||
    safeEpisodes[0] ||
    fallbackEpisode;

  const currentEpIndex = Math.max(
    0,
    safeEpisodes.findIndex((ep) => ep.number === currentEpisode.number)
  );
  const hasPrevEpisode = currentEpIndex > 0 || currentSeasonIndex > 0;
  const hasNextEpisode =
    currentEpIndex < safeEpisodes.length - 1 ||
    currentSeasonIndex < activeSeasons.length - 1;

  const handlePrevEpisode = () => {
    if (currentEpIndex > 0) {
      onChangeEpisode(safeEpisodes[currentEpIndex - 1].number);
    } else if (currentSeasonIndex > 0) {
      const prevSeason = activeSeasons[currentSeasonIndex - 1];
      if (prevSeason && prevSeason.episodes.length > 0) {
        const lastEp = prevSeason.episodes[prevSeason.episodes.length - 1];
        onChangeSeason(prevSeason.seasonNumber, lastEp.number);
      }
    }
  };

  const handleNextEpisode = () => {
    if (currentEpIndex < safeEpisodes.length - 1) {
      onChangeEpisode(safeEpisodes[currentEpIndex + 1].number);
    } else if (currentSeasonIndex < activeSeasons.length - 1) {
      const nextSeason = activeSeasons[currentSeasonIndex + 1];
      if (nextSeason && nextSeason.episodes.length > 0) {
        onChangeSeason(nextSeason.seasonNumber, nextSeason.episodes[0].number);
      }
    }
  };

  const enrichedAnime: AnimeItem = {
    ...anime,
    pageUrl: resolvedPageUrl || anime.pageUrl,
    seasons: activeSeasons,
    synopsis: activeSynopsis,
    genres: activeGenres,
  };

  return (
    <main className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Minimal Back Strip */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onBackHome}
          className="h-9 px-3.5 rounded-lg border border-zinc-200 bg-white text-zinc-950 hover:border-blue-600 hover:text-blue-600 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </button>

        <span className="font-display font-bold text-sm sm:text-base text-zinc-950 truncate">
          {anime.title}
        </span>
      </div>

      {/* 1. Video Player & Server Switcher */}
      <section aria-label="Video Player" className="space-y-4">
        <VideoPlayer
          anime={enrichedAnime}
          seasonNumber={currentSeason.seasonNumber}
          currentEpisode={currentEpisode}
          isResolvingSeries={isResolvingSeries}
        />

        {/* 2. Season Switcher & Prev/Next Controls */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pt-1">
          <div
            className="flex flex-wrap items-center gap-2"
            role="tablist"
            aria-label="Seasons"
          >
            {activeSeasons.map((season) => {
              const active = season.seasonNumber === currentSeason.seasonNumber;
              return (
                <button
                  key={season.seasonNumber}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    const firstEpNum = season.episodes[0]?.number ?? 1;
                    onChangeSeason(season.seasonNumber, firstEpNum);
                  }}
                  className={`h-9 px-4 rounded-lg text-sm font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-zinc-950 border-zinc-200 hover:border-blue-600 hover:text-blue-600'
                  }`}
                >
                  {season.name}
                </button>
              );
            })}
            {isResolvingSeries && (
              <span className="text-xs font-mono text-blue-600 px-1 py-2">
                Loading seasons...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              disabled={!hasPrevEpisode}
              onClick={handlePrevEpisode}
              className="h-9 px-3 rounded-lg border border-zinc-200 bg-white text-zinc-950 hover:border-blue-600 hover:text-blue-600 disabled:opacity-40 disabled:pointer-events-none text-xs sm:text-sm font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>

            <button
              type="button"
              disabled={!hasNextEpisode}
              onClick={handleNextEpisode}
              className="h-9 px-3 rounded-lg border border-zinc-200 bg-white text-zinc-950 hover:border-blue-600 hover:text-blue-600 disabled:opacity-40 disabled:pointer-events-none text-xs sm:text-sm font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 3. Episode Number Boxes (1, 2, 3, 4...) */}
      <section aria-label="Episodes" className="space-y-3 pt-4 border-t border-zinc-200">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-zinc-950">
            {safeSeason.name} — Episodes ({safeEpisodes.length})
          </h2>
          {isResolvingSeries && (
            <span className="text-xs font-mono text-blue-600">Syncing episodes...</span>
          )}
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
          {safeEpisodes.map((ep) => {
            const isCurrent = ep.number === currentEpisode.number;
            const isWatched = watchedSet.has(
              `${anime.id}-s${safeSeason.seasonNumber}-e${ep.number}`
            );

            return (
              <button
                key={`${safeSeason.seasonNumber}-${ep.number}`}
                type="button"
                onClick={() => onChangeEpisode(ep.number)}
                className={`h-10 rounded-lg font-mono tabular-nums text-sm font-semibold border transition-colors flex items-center justify-center cursor-pointer ${
                  isCurrent
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : isWatched
                    ? 'bg-blue-50 border-blue-200 text-blue-600 hover:border-blue-600'
                    : 'bg-white border-zinc-200 text-zinc-950 hover:border-blue-600 hover:text-blue-600'
                }`}
              >
                {ep.number}
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Anime Poster & Details */}
      <section
        aria-label="Anime Details"
        className="py-6 border-t border-b border-zinc-200 grid grid-cols-1 sm:grid-cols-12 gap-6 items-start"
      >
        <div className="sm:col-span-3 md:col-span-2 max-w-[180px] w-full">
          <div className="rounded-xl overflow-hidden border border-zinc-200 bg-white">
            <AnimePoster
              src={anime.posterUrl}
              alt={anime.title}
              japaneseTitle={anime.japaneseTitle}
              aspectClass="aspect-[3/4]"
            />
          </div>
        </div>

        <div className="sm:col-span-9 md:col-span-10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-zinc-950">
              {anime.title}
            </h1>

            <button
              type="button"
              onClick={(e) => onToggleFavorite(anime.id, e)}
              aria-label={isFavorite ? 'Remove from Favorites' : 'Save to Favorites'}
              className={`h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                isFavorite
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-zinc-200 text-zinc-950 hover:border-blue-600 hover:text-blue-600'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-white text-white' : ''}`} />
              <span>{isFavorite ? 'Saved' : 'Favorite'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className="text-blue-600 font-mono font-semibold">★ {anime.score}</span>
            <span aria-hidden="true">·</span>
            <span>{anime.type}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{anime.year}</span>
            <span aria-hidden="true">·</span>
            <span>{activeGenres.join(' / ')}</span>
          </div>

          <p className="text-sm text-zinc-700 leading-relaxed max-w-3xl line-clamp-4">
            {activeSynopsis}
          </p>
        </div>
      </section>

      {/* 5. Recommended Anime Below */}
      {recommendedAnime.length > 0 && (
        <section aria-label="Recommended Anime" className="space-y-4 pb-8">
          <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-950">
            Recommended
          </h2>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5 sm:gap-3">
            {recommendedAnime.map((rec) => (
              <AnimeCard
                key={rec.id}
                anime={rec}
                size="mini"
                onSelect={onSelectAnime}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
};
