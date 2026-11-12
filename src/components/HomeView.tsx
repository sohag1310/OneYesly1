import React from 'react';
import { AnimeItem } from '../types/anime';
import { HeroBanner } from './HeroBanner';
import { AnimeCard } from './AnimeCard';

interface HomeViewProps {
  isLoadingCatalog: boolean;
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

interface RowProps {
  title: string;
  items: AnimeItem[];
  onSelect: (anime: AnimeItem) => void;
  size?: 'trending' | 'mini';
}

const AnimeRow: React.FC<RowProps> = ({ title, items, onSelect, size = 'mini' }) => {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-950 px-4 sm:px-6 lg:px-8">
        {title}
      </h2>
      <div className="overflow-x-auto no-scrollbar px-4 sm:px-6 lg:px-8">
        <div
          className={`flex gap-3 ${
            size === 'trending' ? 'min-w-max' : 'flex-wrap'
          }`}
        >
          {items.map((anime) => (
            <div
              key={anime.id}
              className={size === 'trending' ? 'w-36 sm:w-44 shrink-0' : 'w-28 sm:w-36 shrink-0'}
            >
              <AnimeCard anime={anime} size={size} onSelect={onSelect} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const HomeView: React.FC<HomeViewProps> = ({
  isLoadingCatalog,
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
  // Favorites view
  if (showFavoritesOnly) {
    return (
      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-zinc-950">
            My Favorites
            {favoriteItems.length > 0 && (
              <span className="ml-2 text-base font-mono text-blue-600">
                ({favoriteItems.length})
              </span>
            )}
          </h1>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-sm text-zinc-500 hover:text-blue-600 transition-colors cursor-pointer"
          >
            ← Back
          </button>
        </div>
        {favoriteItems.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <p className="text-zinc-500 text-sm">No favorites saved yet.</p>
            <button
              type="button"
              onClick={onResetFilters}
              className="text-blue-600 text-sm font-medium hover:underline cursor-pointer"
            >
              Browse anime
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5 sm:gap-3">
            {favoriteItems.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} size="mini" onSelect={onSelectAnime} />
            ))}
          </div>
        )}
      </main>
    );
  }

  // Search results view
  if (searchQuery.trim().length > 0) {
    return (
      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-zinc-950">
            {isSearchingLive ? (
              <span className="text-blue-600 text-sm font-mono animate-pulse">Searching...</span>
            ) : (
              <>
                Results for{' '}
                <span className="text-blue-600">&ldquo;{searchQuery}&rdquo;</span>
                {searchResults.length > 0 && (
                  <span className="ml-2 text-base font-mono text-zinc-400">
                    ({searchResults.length})
                  </span>
                )}
              </>
            )}
          </h2>
        </div>

        {!isSearchingLive && searchResults.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-zinc-500 text-sm">
              No results found for &ldquo;{searchQuery}&rdquo;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5 sm:gap-3">
            {searchResults.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} size="mini" onSelect={onSelectAnime} />
            ))}
          </div>
        )}
      </main>
    );
  }

  // Default home view
  return (
    <main className="space-y-10 pb-12">
      {/* Hero Banner */}
      {heroItems.length > 0 && (
        <HeroBanner items={heroItems} onSelectAnime={onSelectAnime} />
      )}

      {isLoadingCatalog && allCatalogList.length === 0 ? (
        <div className="py-20 flex flex-col items-center gap-3 text-zinc-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold">Loading catalog...</p>
        </div>
      ) : (
        <div className="space-y-10">
          <AnimeRow
            title="🔥 Trending Now"
            items={trendingItems}
            onSelect={onSelectAnime}
            size="trending"
          />
          <AnimeRow
            title="🎌 Hindi Dubbed"
            items={hindiDubbedList}
            onSelect={onSelectAnime}
          />
          <AnimeRow
            title="⭐ Popular"
            items={popularList}
            onSelect={onSelectAnime}
          />
          <AnimeRow
            title="⚔️ Action"
            items={actionList}
            onSelect={onSelectAnime}
          />
          <AnimeRow
            title="🧙 Fantasy"
            items={fantasyList}
            onSelect={onSelectAnime}
          />
          <AnimeRow
            title="🚀 Sci-Fi"
            items={scifiList}
            onSelect={onSelectAnime}
          />
          <AnimeRow
            title="🎬 Movies"
            items={moviesList}
            onSelect={onSelectAnime}
          />
        </div>
      )}
    </main>
  );
};
