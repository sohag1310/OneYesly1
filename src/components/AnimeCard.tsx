import React from 'react';
import { Play } from 'lucide-react';
import { AnimeItem } from '../types/anime';
import { AnimePoster } from './AnimePoster';

interface AnimeCardProps {
  anime: AnimeItem;
  size?: 'trending' | 'mini';
  onSelect: (anime: AnimeItem) => void;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({
  anime,
  size = 'mini',
  onSelect,
}) => {
  const isTrending = size === 'trending';

  return (
    <article
      onClick={() => onSelect(anime)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(anime);
        }
      }}
      className="group flex flex-col cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded-lg"
    >
      <div
        className={`relative overflow-hidden border border-zinc-200 bg-white transition-colors group-hover:border-blue-600 ${
          isTrending ? 'rounded-xl' : 'rounded-lg'
        }`}
      >
        <AnimePoster
          src={anime.posterUrl}
          alt={anime.title}
          japaneseTitle={anime.japaneseTitle}
          aspectClass="aspect-[3/4]"
          priority={isTrending}
        />

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
          <div
            className={`rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-150 ${
              isTrending ? 'w-10 h-10 sm:w-11 sm:h-11' : 'w-8 h-8'
            }`}
          >
            <Play
              className={`fill-white ml-0.5 ${
                isTrending ? 'w-4 h-4 sm:w-5 sm:h-5' : 'w-3.5 h-3.5'
              }`}
            />
          </div>
        </div>
      </div>

      <h3
        className={`text-zinc-950 group-hover:text-blue-600 transition-colors line-clamp-1 ${
          isTrending
            ? 'font-display pt-2 text-xs sm:text-sm font-bold'
            : 'font-sans pt-1.5 text-[11px] sm:text-xs font-medium'
        }`}
      >
        {anime.title}
      </h3>
    </article>
  );
};
