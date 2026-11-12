import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchLiveAnimeCatalog,
  getInitialAnimeCatalog,
  searchLiveAnime,
} from './data/animeCatalog';
import { AnimeItem } from './types/anime';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { WatchView } from './components/WatchView';
import { scoreTitleMatch } from './utils/searchMatch';
import { PosterDeduplicator } from './utils/posterDedupe';

const FAVORITES_STORAGE_KEY = 'one_yesly_favorites_v1';
const WATCHED_STORAGE_KEY = 'one_yesly_watched_v1';
const LAST_EPISODE_STORAGE_KEY = 'one_yesly_last_ep_v1';

function loadStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadLastEpisodeMap(): Record<string, { season: number; episode: number }> {
  try {
    const raw = localStorage.getItem(LAST_EPISODE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [liveAnime, setLiveAnime] = useState<AnimeItem[]>(getInitialAnimeCatalog);
  const [knownItemsMap, setKnownItemsMap] = useState<Record<string, AnimeItem>>({});
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);
  const [liveSearchItems, setLiveSearchItems] = useState<AnimeItem[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const [favoriteList, setFavoriteList] = useState<string[]>(() =>
    loadStringArray(FAVORITES_STORAGE_KEY)
  );
  const [watchedList, setWatchedList] = useState<string[]>(() =>
    loadStringArray(WATCHED_STORAGE_KEY)
  );
  const [lastEpMap, setLastEpMap] = useState<
    Record<string, { season: number; episode: number }>
  >(() => loadLastEpisodeMap());

  const [selectedAnime, setSelectedAnime] = useState<AnimeItem | null>(null);
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [activeEpisode, setActiveEpisode] = useState<number>(1);

  useEffect(() => {
    let active = true;
    fetchLiveAnimeCatalog()
      .then((items) => {
        if (active && items.length > 0) {
          setLiveAnime(items);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteList));
    } catch {
      // Ignore storage errors
    }
  }, [favoriteList]);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(watchedList));
    } catch {
      // Ignore storage errors
    }
  }, [watchedList]);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_EPISODE_STORAGE_KEY, JSON.stringify(lastEpMap));
    } catch {
      // Ignore storage errors
    }
  }, [lastEpMap]);

  const allCatalogList = useMemo(() => {
    const seen = new Set<string>();
    const unique: AnimeItem[] = [];
    for (const item of liveAnime) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }
    return unique;
  }, [liveAnime]);

  const allAnimeLookup = useMemo(() => {
    const map = new Map<string, AnimeItem>();
    for (const item of liveAnime) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
    for (const item of liveSearchItems) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
    for (const item of Object.values(knownItemsMap)) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
    return map;
  }, [liveAnime, liveSearchItems, knownItemsMap]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setLiveSearchItems([]);
      setIsSearchingLive(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setIsSearchingLive(true);

    const timer = window.setTimeout(() => {
      searchLiveAnime(q, controller.signal)
        .then((results) => {
          if (!active || controller.signal.aborted) return;
          setLiveSearchItems(results);
          setIsSearchingLive(false);
          if (results.length > 0) {
            setKnownItemsMap((prev) => {
              let next: Record<string, AnimeItem> | null = null;
              for (const r of results) {
                if (!prev[r.id]) {
                  if (!next) next = { ...prev };
                  next[r.id] = r;
                }
              }
              return next || prev;
            });
          }
        })
        .catch(() => {
          if (!active || controller.signal.aborted) return;
          setIsSearchingLive(false);
        });
    }, 120);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const favoriteIds = useMemo(() => new Set(favoriteList), [favoriteList]);
  const watchedSet = useMemo(() => new Set(watchedList), [watchedList]);

  const handleToggleFavorite = useCallback((animeId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFavoriteList((prev) =>
      prev.includes(animeId) ? prev.filter((id) => id !== animeId) : [animeId, ...prev]
    );
  }, []);

  const markWatched = useCallback((animeId: string, seasonNum: number, epNum: number) => {
    const key = `${animeId}-s${seasonNum}-e${epNum}`;
    setWatchedList((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setLastEpMap((prev) => ({
      ...prev,
      [animeId]: { season: seasonNum, episode: epNum },
    }));
  }, []);

  const handleSelectAnime = useCallback(
    (anime: AnimeItem) => {
      const saved = lastEpMap[anime.id];
      const sNum = typeof saved?.season === 'number' ? saved.season : 1;
      const eNum = typeof saved?.episode === 'number' ? saved.episode : 1;

      setKnownItemsMap((prev) =>
        prev[anime.id] ? prev : { ...prev, [anime.id]: anime }
      );
      setSelectedAnime(anime);
      setActiveSeason(sNum);
      setActiveEpisode(eNum);
      markWatched(anime.id, sNum, eNum);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [lastEpMap, markWatched]
  );

  const handleSelectSuggestion = useCallback(
    (anime: AnimeItem) => {
      setSearchQuery('');
      setShowFavoritesOnly(false);
      handleSelectAnime(anime);
    },
    [handleSelectAnime]
  );

  const handleChangeSeason = useCallback(
    (seasonNum: number, initialEpisodeNum?: number) => {
      const epNum = typeof initialEpisodeNum === 'number' ? initialEpisodeNum : 1;
      setActiveSeason(seasonNum);
      setActiveEpisode(epNum);
      if (selectedAnime) {
        markWatched(selectedAnime.id, seasonNum, epNum);
      }
    },
    [selectedAnime, markWatched]
  );

  const handleChangeEpisode = useCallback(
    (episodeNum: number) => {
      setActiveEpisode(episodeNum);
      if (selectedAnime) {
        markWatched(selectedAnime.id, activeSeason, episodeNum);
      }
    },
    [selectedAnime, activeSeason, markWatched]
  );

  const handleGoHome = useCallback(() => {
    setSelectedAnime(null);
    setShowFavoritesOnly(false);
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.trim().length > 0) {
      setSelectedAnime(null);
      setShowFavoritesOnly(false);
    }
  }, []);

  const handleToggleFavoritesView = useCallback(() => {
    setSelectedAnime(null);
    setSearchQuery('');
    setShowFavoritesOnly((prev) => !prev);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Strictly mutually-exclusive Home Page sections: no poster ever repeats across Hero, Trending, or any category row
  const {
    heroItems,
    trendingItems,
    hindiDubbedList,
    popularList,
    actionList,
    fantasyList,
    scifiList,
    moviesList,
  } = useMemo(() => {
    const deduper = new PosterDeduplicator();

    const heroCandidates = [
      ...liveAnime.filter((a) => a.isHero),
      ...liveAnime,
    ];
    const hero = deduper.takeUnique(heroCandidates, 6);

    const trendingCandidates = [
      ...liveAnime.filter((a) => !a.isHero && a.category === 'trending_large'),
      ...liveAnime.filter((a) => !a.isHero && a.type !== 'Movie'),
      ...liveAnime,
    ];
    const trending = deduper.takeUnique(trendingCandidates, 8);

    const hindi = deduper.takeUnique(
      liveAnime.filter((a) => !a.isHero && a.category === 'hindi_dubbed'),
      20
    );

    const popular = deduper.takeUnique(
      liveAnime.filter((a) => !a.isHero && a.category === 'popular'),
      20
    );

    const action = deduper.takeUnique(
      [
        ...liveAnime.filter((a) => !a.isHero && a.category === 'action'),
        ...liveAnime.filter(
          (a) =>
            !a.isHero &&
            a.type !== 'Movie' &&
            a.genres.some((g) => g.toLowerCase().includes('action'))
        ),
      ],
      20
    );

    const fantasy = deduper.takeUnique(
      [
        ...liveAnime.filter((a) => !a.isHero && a.category === 'fantasy'),
        ...liveAnime.filter(
          (a) =>
            !a.isHero &&
            a.type !== 'Movie' &&
            a.genres.some(
              (g) =>
                g.toLowerCase().includes('fantasy') ||
                g.toLowerCase().includes('supernatural') ||
                g.toLowerCase().includes('adventure')
            )
        ),
      ],
      20
    );

    const scifi = deduper.takeUnique(
      [
        ...liveAnime.filter((a) => !a.isHero && a.category === 'scifi'),
        ...liveAnime.filter(
          (a) =>
            !a.isHero &&
            a.type !== 'Movie' &&
            a.genres.some(
              (g) =>
                g.toLowerCase().includes('sci-fi') ||
                g.toLowerCase().includes('mystery') ||
                g.toLowerCase().includes('drama')
            )
        ),
      ],
      20
    );

    const movies = deduper.takeUnique(
      liveAnime.filter(
        (a) => !a.isHero && (a.category === 'movies' || a.type === 'Movie')
      ),
      20
    );

    return {
      heroItems: hero,
      trendingItems: trending,
      hindiDubbedList: hindi,
      popularList: popular,
      actionList: action,
      fantasyList: fantasy,
      scifiList: scifi,
      moviesList: movies,
    };
  }, [liveAnime]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];

    const candidateMap = new Map<string, AnimeItem>();
    for (const item of allCatalogList) {
      candidateMap.set(item.id, item);
    }
    for (const item of liveSearchItems) {
      if (!candidateMap.has(item.id)) {
        candidateMap.set(item.id, item);
      }
    }

    const scored: { item: AnimeItem; score: number }[] = [];
    for (const item of candidateMap.values()) {
      const score = scoreTitleMatch(
        item.title,
        item.slug || item.japaneseTitle,
        q
      );
      if (score > 0) {
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.title.localeCompare(b.item.title);
    });

    return scored.slice(0, 36).map((entry) => entry.item);
  }, [searchQuery, allCatalogList, liveSearchItems]);

  const searchSuggestions = useMemo(
    () => searchResults.slice(0, 6),
    [searchResults]
  );

  const favoriteItems = useMemo(() => {
    return favoriteList
      .map((id) => allAnimeLookup.get(id))
      .filter((item): item is AnimeItem => Boolean(item));
  }, [favoriteList, allAnimeLookup]);

  const recommendedAnime = useMemo(() => {
    if (!selectedAnime) return [];
    const targetGenres = new Set(selectedAnime.genres.map((g) => g.toLowerCase()));

    return allCatalogList
      .filter((item) => item.id !== selectedAnime.id)
      .map((item) => {
        const overlap = item.genres.reduce(
          (acc, g) => acc + (targetGenres.has(g.toLowerCase()) ? 2 : 0),
          0
        );
        return { item, score: overlap + parseFloat(item.score || '8') * 0.1 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((entry) => entry.item);
  }, [selectedAnime, allCatalogList]);

  return (
    <div className="min-h-screen flex flex-col bg-white text-zinc-950">
      <Header
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        suggestions={searchSuggestions}
        isSearching={isSearchingLive}
        onSelectSuggestion={handleSelectSuggestion}
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavoritesView={handleToggleFavoritesView}
        favoritesCount={favoriteList.length}
        onGoHome={handleGoHome}
      />

      <div className="flex-1">
        {selectedAnime ? (
          <WatchView
            anime={selectedAnime}
            seasonNumber={activeSeason}
            episodeNumber={activeEpisode}
            onChangeSeason={handleChangeSeason}
            onChangeEpisode={handleChangeEpisode}
            watchedSet={watchedSet}
            isFavorite={favoriteIds.has(selectedAnime.id)}
            onToggleFavorite={handleToggleFavorite}
            recommendedAnime={recommendedAnime}
            onSelectAnime={handleSelectAnime}
            onBackHome={handleGoHome}
          />
        ) : (
          <HomeView
            isLoadingCatalog={isLoadingCatalog}
            heroItems={heroItems}
            trendingItems={trendingItems}
            hindiDubbedList={hindiDubbedList}
            popularList={popularList}
            actionList={actionList}
            fantasyList={fantasyList}
            scifiList={scifiList}
            moviesList={moviesList}
            allCatalogList={allCatalogList}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
            onSelectAnime={handleSelectAnime}
            searchQuery={searchQuery}
            searchResults={searchResults}
            isSearchingLive={isSearchingLive}
            showFavoritesOnly={showFavoritesOnly}
            favoriteItems={favoriteItems}
            onResetFilters={handleGoHome}
          />
        )}
      </div>

      <footer className="border-t border-zinc-100 bg-white">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between text-xs text-zinc-400">
          <span className="brand-wordmark text-base font-extrabold text-zinc-950">
            One<span className="text-blue-600 ml-0.5">Yesly</span>
          </span>
          <span>© {new Date().getFullYear()} One Yesly</span>
        </div>
      </footer>
    </div>
  );
}
