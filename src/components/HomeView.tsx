import React, { useState, useRef } from 'react';
import { Check, Heart, SearchX } from 'lucide-react';
import { AnimeItem } from '../types/anime';
import { HeroBanner } from './HeroBanner';
import { AnimeCard } from './AnimeCard';
import { AnimePoster } from './AnimePoster';
import { PosterDeduplicator } from '../utils/posterDedupe';

interface HomeViewProps {
  isLoadingCatalog?: boolean;
  heroItems: AnimeItem[];
  trendingItems: AnimeItem[];
  hindiDubbedList: AnimeItem[];
  popularList: AnimeItem[];
  actionList: AnimeItem[];
  fantasyList: AnimeItem[];
  scifiList: AnimeItem[];
  moviesList: AnimeItem[];
  allCatalogList: AnimeItem[];
  favoriteIds: Set<string>;
  onToggleFavorite: (animeId: string, e?: React.MouseEvent) => void;
  onSelectAnime: (anime: AnimeItem) => void;
  searchQuery: string;
  searchResults: AnimeItem[];
  isSearchingLive: boolean;
  showFavoritesOnly: boolean;
  favoriteItems: AnimeItem[];
  onResetFilters: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  isLoadingCatalog = false,
  heroItems,
  trendingItems,
  hindiDubbedList,
  popularList,
  actionList,
  fantasyList,
  scifiList,
  moviesList,
  allCatalogList,
  favoriteIds,
  onToggleFavorite,
  onSelectAnime,
  searchQuery,
  searchResults,
  isSearchingLive,
  showFavoritesOnly,
  favoriteItems,
  onResetFilters,
}) => {
  const [selectingFavorites, setSelectingFavorites] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const trendingRowRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });
  const isSearchMode = searchQuery.trim().length > 0;

  const handleTrendingMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = trendingRowRef.current;
    if (!el) return;
    dragState.current = {
      isDown: true,
      startX: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
      moved: false,
    };
    setIsDragging(true);
  };

  const handleTrendingMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = trendingRowRef.current;
    if (!el || !dragState.current.isDown) return;
    const x = e.pageX - el.offsetLeft;
    const delta = x - dragState.current.startX;
    if (Math.abs(delta) > 6) {
      dragState.current.moved = true;
    }
    el.scrollLeft = dragState.current.scrollLeft - delta;
  };

  const handleTrendingMouseUpOrLeave = () => {
    dragState.current.isDown = false;
    setIsDragging(false);
  };

  // Favorites View Mode (Accessed from the Favorites button beside Search)
  if (showFavoritesOnly && !isSearchMode) {
    return (
      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[75vh] space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-200">
          <h1 className="font-display text-2xl font-bold text-zinc-950">Favorites</h1>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectingFavorites((v) => !v)}
              className={`h-9 px-4 rounded-lg text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                selectingFavorites
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-zinc-200 text-zinc-950 hover:border-blue-600 hover:text-blue-600'
              }`}
            >
              {selectingFavorites ? 'Done Selecting' : 'Select Anime'}
            </button>

            <button
              type="button"
              onClick={onResetFilters}
              className="h-9 px-4 rounded-lg text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
            >
              Home
            </button>
          </div>
        </div>

        {selectingFavorites ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-3">
            {allCatalogList.map((anime) => {
              const selected = favoriteIds.has(anime.id);
              return (
                <button
                  key={anime.id}
                  type="button"
                  onClick={(e) => onToggleFavorite(anime.id, e)}
                  className="group text-left flex flex-col cursor-pointer"
                >
                  <div
                    className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                      selected ? 'border-blue-600' : 'border-zinc-200 group-hover:border-blue-400'
                    }`}
                  >
                    <AnimePoster
                      src={anime.posterUrl}
                      alt={anime.title}
                      aspectClass="aspect-[3/4]"
                    />
                    <div
                      className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/90 text-zinc-400 border border-zinc-200'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <span className="pt-1.5 text-[11px] font-medium text-zinc-950 line-clamp-1">
                    {anime.title}
                  </span>
                </button>
              );
            })}
          </div>
        ) : favoriteItems.length === 0 ? (
          <div className="py-20 flex flex-col items-center text-center max-w-sm mx-auto space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Heart className="w-5 h-5" />
            </div>
            <p className="text-sm text-zinc-700">No anime added to Favorites yet.</p>
            <button
              type="button"
              onClick={() => setSelectingFavorites(true)}
              className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Select Favorites
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3.5">
            {favoriteItems.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                size="mini"
                onSelect={onSelectAnime}
              />
            ))}
          </div>
        )}
      </main>
    );
  }

  // Search Results Mode
  if (isSearchMode) {
    return (
      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[75vh]">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-200 mb-6">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-zinc-950 truncate">
            {isSearchingLive && searchResults.length === 0
              ? 'Searching...'
              : `Search: ${searchQuery.trim()}`}
          </h1>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>

        {searchResults.length === 0 && !isSearchingLive ? (
          <div className="py-20 flex flex-col items-center text-center max-w-sm mx-auto space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <SearchX className="w-5 h-5" />
            </div>
            <p className="text-sm text-zinc-700">No anime found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-3">
            {searchResults.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                size="mini"
                onSelect={onSelectAnime}
              />
            ))}
          </div>
        )}
      </main>
    );
  }

  // Deduplicate "All Available Anime" so it never repeats any poster shown in Hero, Trending, or any category section above
  const remainingAllItems = (() => {
    const deduper = new PosterDeduplicator();
    [
      ...heroItems,
      ...trendingItems,
      ...hindiDubbedList,
      ...popularList,
      ...actionList,
      ...fantasyList,
      ...scifiList,
      ...moviesList,
    ].forEach((item) => deduper.mark(item));
    return deduper.takeUnique(allCatalogList, 30);
  })();

  // Lower Sections with Significantly Smaller Poster Grids
  const miniSections = [
    { id: 'hindi', title: 'Hindi Dubbed', items: hindiDubbedList },
    { id: 'popular', title: 'Popular', items: popularList },
    { id: 'action', title: 'Action & Adventure', items: actionList },
    { id: 'fantasy', title: 'Fantasy & Supernatural', items: fantasyList },
    { id: 'scifi', title: 'Sci-Fi & Mystery', items: scifiList },
    { id: 'movies', title: 'Anime Movies', items: moviesList },
    { id: 'all', title: 'All Available Anime', items: remainingAllItems },
  ].filter((sec) => sec.items.length > 0);

  if (isLoadingCatalog && allCatalogList.length === 0) {
    return (
      <div className="pb-14">
        <div className="w-full h-[300px] sm:h-[380px] bg-zinc-50 animate-pulse border-b border-zinc-100" />
        <main className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pt-6">
          <div className="h-6 w-32 bg-zinc-100 rounded animate-pulse" />
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-zinc-100 animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="pb-14">
      {/* Transparent Auto-Changing Hero Banner */}
      <HeroBanner items={heroItems} onSelectAnime={onSelectAnime} />

      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-10 pt-4">
        {/* Trending Section: 8 Posters in One Single Horizontal Line, Swipeable */}
        <section aria-labelledby="heading-trending" className="space-y-4">
          <h2
            id="heading-trending"
            className="font-display text-xl sm:text-2xl font-bold tracking-tight text-zinc-950"
          >
            Trending
          </h2>

          <div
            ref={trendingRowRef}
            onMouseDown={handleTrendingMouseDown}
            onMouseMove={handleTrendingMouseMove}
            onMouseUp={handleTrendingMouseUpOrLeave}
            onMouseLeave={handleTrendingMouseUpOrLeave}
            onDragStart={(e) => e.preventDefault()}
            className={`-mr-4 pr-4 sm:-mr-6 sm:pr-6 lg:mr-0 lg:pr-0 flex flex-nowrap overflow-x-auto no-scrollbar gap-3 sm:gap-4 touch-pan-x select-none pb-2 ${
              isDragging ? 'cursor-grabbing' : 'snap-x snap-mandatory cursor-grab'
            }`}
          >
            {trendingItems.map((anime) => (
              <div
                key={anime.id}
                className="shrink-0 snap-start w-[41%] sm:w-[28%] md:w-[21.5%] lg:w-[17.2%]"
              >
                <AnimeCard
                  anime={anime}
                  size="trending"
                  onSelect={(selected) => {
                    if (dragState.current.moved) {
                      dragState.current.moved = false;
                      return;
                    }
                    onSelectAnime(selected);
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Lower Sections: Much Smaller Dense Cards Showing Many Available Anime */}
        {miniSections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`heading-${section.id}`}
            className="space-y-3"
          >
            <h2
              id={`heading-${section.id}`}
              className="font-display text-lg sm:text-xl font-bold tracking-tight text-zinc-950"
            >
              {section.title}
            </h2>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5 sm:gap-3">
              {section.items.map((anime) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  size="mini"
                  onSelect={onSelectAnime}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
};
