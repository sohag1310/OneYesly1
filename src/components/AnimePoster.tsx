import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { optimizeImageUrl } from '../data/animeCatalog';

interface AnimePosterProps {
  src: string;
  alt: string;
  japaneseTitle?: string;
  aspectClass?: string;
  className?: string;
  priority?: boolean;
}

const FALLBACK_IMAGE = '/images/hero_anime_epic_1793052173700.jpg';

export const AnimePoster: React.FC<AnimePosterProps> = ({
  src,
  alt,
  japaneseTitle,
  aspectClass = 'aspect-[3/4]',
  className = '',
  priority = false,
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(() => {
    if (!src) return FALLBACK_IMAGE;
    const optimized = optimizeImageUrl(src, 'w342');
    // If it's a direct TMDB or CDN image, load directly for blazing fast edge CDN delivery
    if (optimized.includes('image.tmdb.org') || optimized.startsWith('/')) {
      return optimized;
    }
    if (optimized.startsWith('http://') || optimized.includes('toonstream')) {
      return `/api/poster?url=${encodeURIComponent(optimized)}`;
    }
    return optimized;
  });

  const [attemptProxy, setAttemptProxy] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (!src) {
      setCurrentSrc(FALLBACK_IMAGE);
      setAttemptProxy(false);
      setHasError(false);
      return;
    }

    const optimized = optimizeImageUrl(src, 'w342');
    // Fast path: direct TMDB CDN loading
    if (optimized.includes('image.tmdb.org') || optimized.startsWith('/')) {
      setCurrentSrc(optimized);
      setAttemptProxy(false);
    } else if (optimized.startsWith('http://') || optimized.includes('toonstream')) {
      setCurrentSrc(`/api/poster?url=${encodeURIComponent(optimized)}`);
      setAttemptProxy(true);
    } else {
      setCurrentSrc(optimized);
      setAttemptProxy(false);
    }
    setHasError(false);
  }, [src]);

  const handleImageError = () => {
    // If direct TMDB or external failed and hasn't tried server proxy yet, try server proxy
    if (!attemptProxy && src && src.startsWith('http')) {
      setAttemptProxy(true);
      setCurrentSrc(`/api/poster?url=${encodeURIComponent(src)}`);
      return;
    }

    // If proxy failed, try the local fallback asset before giving up
    if (currentSrc !== FALLBACK_IMAGE) {
      setCurrentSrc(FALLBACK_IMAGE);
      return;
    }

    setHasError(true);
  };

  if (hasError) {
    return (
      <div
        className={`relative overflow-hidden bg-slate-50 border border-zinc-200 flex flex-col justify-between p-5 select-none ${aspectClass} ${className}`}
      >
        <div className="flex items-center justify-between text-[11px] font-semibold text-blue-600">
          <span className="brand-wordmark tracking-wide font-extrabold">ONE YESLY</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">HD</span>
        </div>
        <div className="my-auto flex flex-col items-center text-center gap-2.5 px-2">
          <div className="w-11 h-11 rounded-full border border-blue-200 bg-blue-50 flex items-center justify-center text-blue-600">
            <Play className="w-4 h-4 fill-blue-600 ml-0.5" />
          </div>
          <p className="font-display font-bold text-sm text-zinc-950 line-clamp-2">
            {alt}
          </p>
          {japaneseTitle && (
            <p className="text-xs text-zinc-500 line-clamp-1">{japaneseTitle}</p>
          )}
        </div>
        <div className="h-0.5 w-10 bg-blue-600 mx-auto rounded-full" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-zinc-100 ${aspectClass} ${className}`}>
      {/* Skeleton placeholder while image decodes */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-200 via-zinc-100 to-zinc-200 animate-pulse" />
      )}
      <img
        src={currentSrc || FALLBACK_IMAGE}
        alt={alt}
        referrerPolicy="no-referrer"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={handleImageError}
        className={`w-full h-full object-cover transition-all duration-300 ease-out group-hover:scale-[1.03] ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
