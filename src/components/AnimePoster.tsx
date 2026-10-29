import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';

interface AnimePosterProps {
  src: string;
  alt: string;
  japaneseTitle?: string;
  aspectClass?: string;
  className?: string;
}

const FALLBACK_IMAGE = '/src/assets/images/hero_anime_epic_1793052173700.jpg';

export const AnimePoster: React.FC<AnimePosterProps> = ({
  src,
  alt,
  japaneseTitle,
  aspectClass = 'aspect-[3/4]',
  className = '',
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(src);
  const [attemptProxy, setAttemptProxy] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (!src) {
      setCurrentSrc(FALLBACK_IMAGE);
      setAttemptProxy(false);
      setHasError(false);
      return;
    }

    // If it's a remote http image from Toonstream or external CDN, route through our fast cache proxy
    if (src.startsWith('http://') || (src.startsWith('https://') && src.includes('toonstream'))) {
      setCurrentSrc(`/api/poster?url=${encodeURIComponent(src)}`);
      setAttemptProxy(true);
    } else {
      setCurrentSrc(src);
      setAttemptProxy(false);
    }
    setHasError(false);
  }, [src]);

  const handleImageError = () => {
    // If original failed and hasn't tried server proxy yet, try proxying
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
        <div className="flex items-center justify-between text-[11px] font-mono text-blue-600">
          <span>ONE YESLY</span>
          <span>HD</span>
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
      <img
        src={currentSrc || FALLBACK_IMAGE}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={handleImageError}
        className="w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
      />
    </div>
  );
};
