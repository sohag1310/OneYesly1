import React, { useRef, useState, useEffect } from 'react';
import { Search, Heart, X, Play, Loader2 } from 'lucide-react';
import { AnimeItem } from '../types/anime';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  suggestions: AnimeItem[];
  isSearching: boolean;
  onSelectSuggestion: (anime: AnimeItem) => void;
  showFavoritesOnly: boolean;
  onToggleFavoritesView: () => void;
  favoritesCount: number;
  onGoHome: () => void;
}

const SuggestionThumb: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed || !src) {
    return (
      <div className="w-9 h-12 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-600">
        <Play className="w-3.5 h-3.5 fill-blue-600" />
      </div>
    );
  }

  const cleanSrc =
    src.startsWith('http') && src.includes('toonstream')
      ? `/api/poster?url=${encodeURIComponent(src)}`
      : src;

  return (
    <img
      src={cleanSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-9 h-12 rounded-md object-cover bg-zinc-100 border border-zinc-200 shrink-0"
    />
  );
};

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  suggestions,
  isSearching,
  onSelectSuggestion,
  showFavoritesOnly,
  onToggleFavoritesView,
  favoritesCount,
  onGoHome,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmedQuery = searchQuery.trim();
  const showDropdown =
    isOpen &&
    trimmedQuery.length >= 1 &&
    (suggestions.length > 0 || isSearching || trimmedQuery.length >= 2);

  useEffect(() => {
    setActiveIndex(-1);
  }, [trimmedQuery]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'ArrowDown') {
      if (!isOpen && trimmedQuery.length >= 1) {
        setIsOpen(true);
      }
      if (suggestions.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
      }
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        const chosen = suggestions[activeIndex];
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        onSelectSuggestion(chosen);
      } else {
        setIsOpen(false);
      }
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Website Name on One Side */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            onGoHome();
          }}
          className="brand-wordmark text-[22px] sm:text-[26px] font-extrabold leading-none text-zinc-950 hover:opacity-85 transition-opacity whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 cursor-pointer"
        >
          One<span className="text-blue-600 ml-1">Yesly</span>
        </button>

        {/* Zone 2: Clean Smart Search Option Beside Brand */}
        <div ref={searchBoxRef} className="relative flex-1 max-w-md ml-auto">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search anime..."
              aria-label="Search anime"
              autoComplete="off"
              spellCheck={false}
              className="w-full h-10 pl-10 pr-14 rounded-lg bg-white border border-zinc-200 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 transition-colors"
            />
            <div className="absolute right-2.5 flex items-center gap-1">
              {isSearching && trimmedQuery.length > 0 && (
                <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              )}
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    setIsOpen(false);
                    setActiveIndex(-1);
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="p-1 text-zinc-400 hover:text-zinc-950 rounded-md transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {showDropdown && (
            <div
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+6px)] bg-white border border-zinc-200 rounded-xl shadow-lg shadow-zinc-950/10 overflow-hidden z-50"
            >
              {suggestions.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {suggestions.map((anime, idx) => {
                    const isHighlighted = idx === activeIndex;
                    const epCount = anime.seasons.reduce(
                      (sum, s) => sum + s.episodes.length,
                      0
                    );
                    return (
                      <button
                        key={anime.id}
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          setIsOpen(false);
                          setActiveIndex(-1);
                          onSelectSuggestion(anime);
                        }}
                        className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                          isHighlighted ? 'bg-blue-50/80' : 'bg-white hover:bg-zinc-50'
                        }`}
                      >
                        <SuggestionThumb src={anime.posterUrl} alt={anime.title} />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-semibold line-clamp-1 transition-colors ${
                              isHighlighted ? 'text-blue-600' : 'text-zinc-950'
                            }`}
                          >
                            {anime.title}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
                            <span>{anime.type}</span>
                            {anime.year ? (
                              <>
                                <span>·</span>
                                <span>{anime.year}</span>
                              </>
                            ) : null}
                            {epCount > 1 ? (
                              <>
                                <span>·</span>
                                <span className="font-mono text-[11px] text-blue-600">
                                  {epCount} EP
                                </span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <Play
                          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                            isHighlighted
                              ? 'text-blue-600 fill-blue-600'
                              : 'text-zinc-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : isSearching ? (
                <div className="px-4 py-3.5 flex items-center gap-2.5 text-xs text-zinc-600">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                  <span>Searching stock...</span>
                </div>
              ) : (
                <div className="px-4 py-3.5 text-xs text-zinc-500">
                  Not available in stock.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Zone 3: Favorite Selection / View Option Beside Search */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onToggleFavoritesView();
            }}
            aria-pressed={showFavoritesOnly}
            className={`h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              showFavoritesOnly
                ? 'bg-blue-600 text-white border border-blue-600'
                : 'bg-white text-zinc-950 border border-zinc-200 hover:border-blue-600 hover:text-blue-600'
            }`}
          >
            <Heart
              className={`w-4 h-4 ${
                showFavoritesOnly
                  ? 'fill-white text-white'
                  : favoritesCount > 0
                  ? 'fill-blue-600 text-blue-600'
                  : 'text-current'
              }`}
            />
            <span>Favorites</span>
            {favoritesCount > 0 && (
              <span
                className={`font-mono tabular-nums text-xs ${
                  showFavoritesOnly ? 'text-blue-100' : 'text-blue-600 font-semibold'
                }`}
              >
                ({favoritesCount})
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
