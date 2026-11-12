import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RefreshCw, Radio, Volume2 } from 'lucide-react';
import { AnimeItem, Episode } from '../types/anime';
import {
  cleanAnimeSlug,
  getDeterministicStreamUrl,
  ToonplayServer,
  ToonplayLang,
  ToonplayEpisodeResponse,
} from '../utils/toonplayEngine';

interface VideoPlayerProps {
  anime: AnimeItem;
  seasonNumber: number;
  currentEpisode: Episode;
  isResolvingSeries?: boolean;
}

const DEFAULT_LANGS: ToonplayLang[] = [
  { code: 'hin', label: 'Hindi' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: 'Japanese' },
];

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  anime,
  seasonNumber,
  currentEpisode,
}) => {
  const [selectedLang, setSelectedLang] = useState<string>('hin');
  const [selectedServerIdx, setSelectedServerIdx] = useState<number>(0);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [availableLangs, setAvailableLangs] = useState<ToonplayLang[]>(DEFAULT_LANGS);

  const isMovie =
    anime.type === 'Movie' ||
    Boolean(anime.pageUrl && anime.pageUrl.includes('/movies/'));

  const slug = useMemo(() => {
    return cleanAnimeSlug(
      anime.slug || anime.pageUrl || anime.id || anime.title
    );
  }, [anime.slug, anime.pageUrl, anime.id, anime.title]);

  // Synchronous 0ms direct fallback URL — always ready before any network call
  const directFallbackUrl = useMemo(() => {
    return getDeterministicStreamUrl({
      slug,
      season: seasonNumber,
      ep: currentEpisode.number,
      lang: selectedLang,
      isMovie,
    });
  }, [slug, seasonNumber, currentEpisode.number, selectedLang, isMovie]);

  // Initial immediate server list (0ms mount with zero blank-screen delay)
  const [servers, setServers] = useState<ToonplayServer[]>(() => [
    {
      id: 'server-1',
      name: 'Server 1 (Primary Ad-Free HD)',
      url: directFallbackUrl,
      kind: 'iframe',
    },
    {
      id: 'server-2',
      name: 'Server 2 (Abyss Fast Cloud)',
      url: directFallbackUrl,
      kind: 'iframe',
    },
    {
      id: 'server-3',
      name: 'Server 3 (Direct Fallback Player)',
      url: directFallbackUrl,
      kind: 'iframe',
    },
  ]);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Background Stream Resolver: Asynchronously extracts mirrors and multi-dub tracks
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    // Reset fallback servers immediately so video never stalls
    setServers([
      {
        id: 'server-1',
        name: 'Server 1 (Primary Ad-Free HD)',
        url: directFallbackUrl,
        kind: 'iframe',
      },
      {
        id: 'server-2',
        name: 'Server 2 (Abyss Fast Cloud)',
        url: directFallbackUrl,
        kind: 'iframe',
      },
      {
        id: 'server-3',
        name: 'Server 3 (Direct Fallback Player)',
        url: directFallbackUrl,
        kind: 'iframe',
      },
    ]);

    const endpoint = `/api/toonplay/episode?slug=${encodeURIComponent(
      slug
    )}&season=${seasonNumber}&ep=${currentEpisode.number}&lang=${encodeURIComponent(
      selectedLang
    )}&isMovie=${isMovie}`;

    fetch(endpoint, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ToonplayEpisodeResponse) => {
        if (!active || controller.signal.aborted) return;
        if (data && Array.isArray(data.servers) && data.servers.length > 0) {
          setServers(data.servers);
        }
        if (data && Array.isArray(data.availableLangs) && data.availableLangs.length > 0) {
          setAvailableLangs(data.availableLangs);
        }
      })
      .catch(() => {
        // Fallback remains the deterministic direct stream URL
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [slug, seasonNumber, currentEpisode.number, selectedLang, isMovie, directFallbackUrl, reloadKey]);

  const activeServer = servers[selectedServerIdx] || servers[0];
  const activeUrl = activeServer?.url || directFallbackUrl;

  const handleSelectServer = (idx: number) => {
    setSelectedServerIdx(idx);
  };

  const handleSelectLang = (code: string) => {
    setSelectedLang(code);
  };

  const handleReload = useCallback(() => {
    setReloadKey((prev) => prev + 1);
  }, []);

  return (
    <div>
      {/* 16:9 Anti-Ad & Anti-Popup Sandboxed Video Player Container */}
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-zinc-200 shadow-sm">
        <iframe
          ref={iframeRef}
          key={`toonplay-${slug}-s${seasonNumber}-e${currentEpisode.number}-${selectedServerIdx}-${selectedLang}-${reloadKey}`}
          src={activeUrl}
          title={`${anime.title} - ${isMovie ? 'Movie' : `Season ${seasonNumber} Episode ${currentEpisode.number}`}`}
          sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
          referrerPolicy="no-referrer"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          className="w-full h-full border-0 bg-black"
        />
      </div>

      {/* Multi-Server & Audio Dub Selector Bar */}
      <div className="mt-3 space-y-2.5">
        {/* Servers Row */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="flex items-center gap-1 text-xs font-bold uppercase text-zinc-950 shrink-0">
              <Radio className="w-3.5 h-3.5 text-blue-600" />
              Servers:
            </span>
            {servers.map((s, idx) => {
              const isSelected = selectedServerIdx === idx;
              return (
                <button
                  key={s.id || s.name}
                  type="button"
                  onClick={() => handleSelectServer(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-xs'
                      : 'bg-white border-zinc-200 text-zinc-950 font-semibold hover:border-blue-600 hover:text-blue-600'
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>

          {/* Quick Refresh Stream Button */}
          <button
            type="button"
            onClick={handleReload}
            title="Reload Video Player"
            className="p-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-600 hover:text-blue-600 hover:border-blue-600 shrink-0 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Audio Dub Selector Row */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="flex items-center gap-1 text-xs font-bold uppercase text-zinc-950 shrink-0">
            <Volume2 className="w-3.5 h-3.5 text-blue-600" />
            Audio Dub:
          </span>
          {availableLangs.map((lang) => {
            const isSelected = selectedLang === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleSelectLang(lang.code)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  isSelected
                    ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-xs'
                    : 'bg-white border-zinc-200 text-zinc-950 font-semibold hover:border-blue-600 hover:text-blue-600'
                }`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
