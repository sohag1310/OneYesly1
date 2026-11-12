import React, { useState, useEffect } from 'react';
import { Play, Star } from 'lucide-react';
import { AnimeItem } from '../types/anime';

interface HeroBannerProps {
  items: AnimeItem[];
  onSelectAnime: (anime: AnimeItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ items, onSelectAnime }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;

  const current = items[activeIndex % items.length];
  const numericScore = parseFloat(current.score) || 8.8;
  // Convert 10-point score to 5-star count (e.g., 9.2 -> 4.6 stars)
  const fiveStarRating = Math.min(5, Math.max(1, +(numericScore / 2).toFixed(1)));
  const filledStars = Math.round(fiveStarRating);
  const totalEpisodes = current.seasons.reduce((sum, s) => sum + s.episodes.length, 0);

  return (
    <section
      aria-label="Featured Anime"
      onClick={() => onSelectAnime(current)}
      className="relative w-full min-h-[300px] sm:min-h-[380px] lg:min-h-[450px] overflow-hidden cursor-pointer select-none flex items-end"
    >
      {/* Auto-rotating crossfade backdrop images */}
      {items.map((item, idx) => {
        const isActive = idx === activeIndex % items.length;
        return (
          <img
            key={item.id}
            src={item.bannerUrl || item.posterUrl}
            alt={item.title}
            referrerPolicy="no-referrer"
            loading={idx === 0 ? 'eager' : 'lazy'}
            fetchPriority={idx === 0 ? 'high' : 'auto'}
            decoding="async"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/images/hero_anime_epic_1793052173700.jpg';
            }}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ease-out ${
              isActive ? 'opacity-90' : 'opacity-0 pointer-events-none'
            }`}
          />
        );
      })}

      {/* Transparent blending gradients into the pure white background */}
      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/88 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-white/35" />

      {/* Dynamic Anime-Specific Content */}
      <div className="relative z-10 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8 sm:pb-12">
        <div className="max-w-xl space-y-3 sm:space-y-3.5">
          {/* Star Rating + Anime Metadata */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-zinc-800">
            <span className="inline-flex items-center gap-1 text-blue-600 font-mono tabular-nums font-semibold">
              <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((starIdx) => (
                  <Star
                    key={starIdx}
                    className={`w-3.5 h-3.5 ${
                      starIdx <= filledStars
                        ? 'fill-blue-600 text-blue-600'
                        : 'text-blue-300'
                    }`}
                  />
                ))}
              </span>
              <span className="ml-1">{current.score}</span>
            </span>

            <span aria-hidden="true" className="text-zinc-400">·</span>
            <span className="font-medium text-zinc-900">{current.type}</span>
            <span aria-hidden="true" className="text-zinc-400">·</span>
            <span className="font-mono tabular-nums text-zinc-700">{current.year}</span>
            <span aria-hidden="true" className="text-zinc-400">·</span>
            <span className="font-mono tabular-nums text-zinc-700">
              {totalEpisodes} {totalEpisodes === 1 ? 'Episode' : 'Episodes'}
            </span>
          </div>

          {/* Anime Title & Genres */}
          <div className="space-y-1">
            <h1
              className="font-display text-2xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-zinc-950 leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              {current.title}
            </h1>

            <p className="text-xs sm:text-sm font-medium text-blue-600">
              {current.genres.join(' · ')}
              {current.studio ? ` · ${current.studio}` : ''}
            </p>
          </div>

          {/* Concise Story Description Specific to Current Anime */}
          <p className="text-xs sm:text-sm text-zinc-800 leading-relaxed line-clamp-2 max-w-lg">
            {current.synopsis}
          </p>

          {/* Primary Watch Button */}
          <div className="pt-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnime(current);
              }}
              className="h-10 sm:h-11 px-5 sm:px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Watch Now</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
