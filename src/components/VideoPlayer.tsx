import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { RefreshCw } from 'lucide-react';
import { AnimeItem, Episode, StreamQualityOption, StreamServer } from '../types/anime';
import { fetchToonstreamEpisodeServers } from '../data/animeCatalog';

interface VideoPlayerProps {
  anime: AnimeItem;
  seasonNumber: number;
  currentEpisode: Episode;
  isResolvingSeries?: boolean;
}

interface AudioTrackItem {
  id: number;
  name: string;
}

interface HlsQualityItem {
  levelIndex: number;
  label: string;
  height: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  anime,
  seasonNumber,
  currentEpisode,
  isResolvingSeries = false,
}) => {
  const [servers, setServers] = useState<StreamServer[]>([]);
  const [selectedServerIdx, setSelectedServerIdx] = useState(0);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Native HLS / MP4 multi-audio & multi-quality states
  const [audioTracks, setAudioTracks] = useState<AudioTrackItem[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<number>(0);
  const [hlsQualities, setHlsQualities] = useState<HlsQualityItem[]>([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1); // -1 = Auto
  const [customStreamOverride, setCustomStreamOverride] =
    useState<StreamQualityOption | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const adSkipTimersRef = useRef<number[]>([]);
  const networkRetryCountRef = useRef<number>(0);
  const savedTimeRef = useRef<number>(0);

  // Only fall back to anime.firstEpUrl when playing Season 1 Episode 1 before full series seasons resolve
  const targetEpisodeUrl =
    currentEpisode.episodeUrl ||
    (seasonNumber === 1 && currentEpisode.number === 1 ? anime.firstEpUrl : undefined);

  const clearAdSkipTimers = useCallback(() => {
    adSkipTimersRef.current.forEach((id) => window.clearTimeout(id));
    adSkipTimersRef.current = [];
  }, []);

  const destroyHlsInstance = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // Ignore cleanup errors
      }
      hlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAdSkipTimers();
      destroyHlsInstance();
    };
  }, [clearAdSkipTimers, destroyHlsInstance]);

  // Fetch servers whenever anime / season / episode changes
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    clearAdSkipTimers();
    destroyHlsInstance();
    savedTimeRef.current = 0;
    setCustomStreamOverride(null);
    setAudioTracks([]);
    setHlsQualities([]);
    setSelectedHlsLevel(-1);

    if (!targetEpisodeUrl) {
      setServers([]);
      setSelectedServerIdx(0);
      setIsLoadingStream(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    setIsLoadingStream(true);
    setSelectedServerIdx(0);

    fetchToonstreamEpisodeServers(targetEpisodeUrl, controller.signal)
      .then((res) => {
        if (!active || controller.signal.aborted) return;
        setServers(res.servers);
        setSelectedServerIdx(0);
        setIsLoadingStream(false);
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setServers([]);
        setIsLoadingStream(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    anime.id,
    seasonNumber,
    currentEpisode.number,
    targetEpisodeUrl,
    reloadNonce,
    clearAdSkipTimers,
    destroyHlsInstance,
  ]);

  const activeServer = servers[selectedServerIdx];
  const effectiveKind =
    customStreamOverride?.kind || activeServer?.kind || 'iframe';
  const effectiveUrl = customStreamOverride?.url || activeServer?.url || '';

  const advanceToFallbackServer = useCallback(() => {
    setCustomStreamOverride(null);
    setSelectedServerIdx((prev) => {
      if (prev + 1 < servers.length) {
        return prev + 1;
      }
      return prev;
    });
  }, [servers.length]);

  // Attach native HLS.js or direct MP4 stream when active server is 'hls' or 'mp4'
  useEffect(() => {
    destroyHlsInstance();
    setAudioTracks([]);
    setHlsQualities([]);
    setSelectedHlsLevel(-1);
    networkRetryCountRef.current = 0;

    if (!activeServer || effectiveKind === 'iframe' || !effectiveUrl) {
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (effectiveKind === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          maxBufferLength: 30,
          backBufferLength: 30,
        });
        hlsRef.current = hls;

        hls.loadSource(effectiveUrl);
        hls.attachMedia(videoEl);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const seenHeights = new Set<number>();
          const levels: HlsQualityItem[] = [];
          hls.levels.forEach((lvl, idx) => {
            const h = lvl.height || 0;
            if (h > 0 && !seenHeights.has(h)) {
              seenHeights.add(h);
              levels.push({
                levelIndex: idx,
                label: `${h}p`,
                height: h,
              });
            }
          });
          levels.sort((a, b) => b.height - a.height);
          setHlsQualities(levels);

          if (savedTimeRef.current > 1) {
            videoEl.currentTime = savedTimeRef.current;
          }
          videoEl.play().catch(() => {});
        });

        const syncAudioTracks = () => {
          if (!hls.audioTracks || hls.audioTracks.length <= 1) {
            setAudioTracks([]);
            return;
          }
          setAudioTracks(
            hls.audioTracks.map((t, idx) => ({
              id: idx,
              name: t.name || t.lang || `Audio ${idx + 1}`,
            }))
          );
          if (hls.audioTrack >= 0) {
            setSelectedAudioId(hls.audioTrack);
          }
        };

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudioTracks);
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_evt, data) => {
          setSelectedAudioId(data.id);
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;

          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            networkRetryCountRef.current < 1
          ) {
            networkRetryCountRef.current += 1;
            hls.startLoad();
            return;
          }
          if (
            data.type === Hls.ErrorTypes.MEDIA_ERROR &&
            networkRetryCountRef.current < 1
          ) {
            networkRetryCountRef.current += 1;
            hls.recoverMediaError();
            return;
          }

          hls.destroy();
          hlsRef.current = null;
          advanceToFallbackServer();
        });

        return () => {
          hls.destroy();
          if (hlsRef.current === hls) {
            hlsRef.current = null;
          }
        };
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = effectiveUrl;
        const onLoadedMeta = () => {
          if (savedTimeRef.current > 1) {
            videoEl.currentTime = savedTimeRef.current;
          }
          videoEl.play().catch(() => {});
        };
        videoEl.addEventListener('loadedmetadata', onLoadedMeta);
        return () => {
          videoEl.removeEventListener('loadedmetadata', onLoadedMeta);
        };
      }
    } else if (effectiveKind === 'mp4') {
      videoEl.src = effectiveUrl;
      const onLoadedMeta = () => {
        if (savedTimeRef.current > 1) {
          videoEl.currentTime = savedTimeRef.current;
        }
        videoEl.play().catch(() => {});
      };
      videoEl.addEventListener('loadedmetadata', onLoadedMeta);
      return () => {
        videoEl.removeEventListener('loadedmetadata', onLoadedMeta);
      };
    }
  }, [
    activeServer,
    effectiveKind,
    effectiveUrl,
    destroyHlsInstance,
    advanceToFallbackServer,
  ]);

  const handleSelectServer = (idx: number) => {
    savedTimeRef.current = videoRef.current?.currentTime || 0;
    setCustomStreamOverride(null);
    setSelectedServerIdx(idx);
  };

  const handleSelectAudioTrack = (trackId: number) => {
    setSelectedAudioId(trackId);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
    }
  };

  const handleSelectHlsQuality = (levelIdx: number) => {
    setSelectedHlsLevel(levelIdx);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIdx;
    }
  };

  const handleSelectDirectQuality = (opt: StreamQualityOption) => {
    savedTimeRef.current = videoRef.current?.currentTime || 0;
    setCustomStreamOverride(opt);
  };

  const dispatchPreRollSkip = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ action: 'startVideo' }, '*');
      win.postMessage({ type: 'skipAd' }, '*');
    } catch {
      // Ignore cross-origin postMessage restrictions
    }
  }, []);

  const handleIframeLoad = useCallback(() => {
    clearAdSkipTimers();
    dispatchPreRollSkip();
    [350, 900, 1800, 3000, 4500, 6500, 9000].forEach((delay) => {
      const id = window.setTimeout(dispatchPreRollSkip, delay);
      adSkipTimersRef.current.push(id);
    });
  }, [clearAdSkipTimers, dispatchPreRollSkip]);

  const showLoading = isLoadingStream || (isResolvingSeries && !targetEpisodeUrl);
  const hasToonstreamSource = Boolean(targetEpisodeUrl || anime.pageUrl);
  const isNativeVideo =
    Boolean(activeServer?.url) &&
    (effectiveKind === 'hls' || effectiveKind === 'mp4');

  return (
    <div>
      {/* 16:9 Ad-Free Video Player Container */}
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-zinc-200">
        {showLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-zinc-300">Loading stream...</p>
          </div>
        ) : isNativeVideo ? (
          <video
            ref={videoRef}
            key={`native-${seasonNumber}-${currentEpisode.number}-${selectedServerIdx}-${effectiveUrl}`}
            poster={anime.bannerUrl || anime.posterUrl}
            controls
            autoPlay
            playsInline
            crossOrigin={
              activeServer?.subtitles && activeServer.subtitles.length > 0
                ? 'anonymous'
                : undefined
            }
            onError={() => {
              // If a custom MP4 quality failed, try falling back or switching server
              if (
                customStreamOverride &&
                activeServer?.qualities &&
                activeServer.qualities.length > 1
              ) {
                const fallbackOpt = activeServer.qualities.find(
                  (q) => q.url !== customStreamOverride.url
                );
                if (fallbackOpt) {
                  setCustomStreamOverride(fallbackOpt);
                  return;
                }
              }
              advanceToFallbackServer();
            }}
            className="w-full h-full object-contain bg-black"
          >
            {activeServer?.subtitles?.map((sub, i) => (
              <track
                key={`${sub.url}-${i}`}
                kind="subtitles"
                src={sub.url}
                srcLang={sub.lang}
                label={sub.label}
                default={i === 0}
              />
            ))}
          </video>
        ) : activeServer?.url ? (
          <iframe
            ref={iframeRef}
            key={`iframe-${seasonNumber}-${currentEpisode.number}-${activeServer.url}`}
            src={activeServer.url}
            title={`${anime.title} - Season ${seasonNumber} ${currentEpisode.title}`}
            onLoad={handleIframeLoad}
            {...(activeServer.allowSandbox !== false
              ? {
                  sandbox:
                    'allow-scripts allow-same-origin allow-forms allow-presentation',
                }
              : {})}
            className="w-full h-full border-0"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          />
        ) : hasToonstreamSource ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white gap-3">
            <p className="text-sm text-zinc-300">
              Stream is temporarily busy for this episode.
            </p>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Stream</span>
            </button>
          </div>
        ) : (
          <video
            key={currentEpisode.videoUrl}
            src={currentEpisode.videoUrl}
            poster={anime.bannerUrl || anime.posterUrl}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black"
          />
        )}
      </div>

      {/* Server, Audio Language & Quality Controls */}
      {servers.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <span className="text-xs font-bold uppercase text-zinc-950 shrink-0">
              Servers:
            </span>
            {servers.map((s, idx) => {
              const isSelected = selectedServerIdx === idx;
              return (
                <button
                  key={`${s.url}-${idx}`}
                  type="button"
                  onClick={() => handleSelectServer(idx)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white font-bold'
                      : 'bg-white border-zinc-200 text-zinc-950 font-semibold hover:border-blue-600 hover:text-blue-600'
                  }`}
                >
                  {s.name || `Server ${idx + 1}`}
                </button>
              );
            })}
          </div>

          {/* Native Multi-Audio & Quality Bar (shown when native zero-ad HLS/MP4 stream has multiple tracks/qualities) */}
          {(audioTracks.length > 1 ||
            hlsQualities.length > 1 ||
            (activeServer?.qualities && activeServer.qualities.length > 1)) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {audioTracks.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-xs font-bold uppercase text-zinc-950 shrink-0">
                    Audio:
                  </span>
                  {audioTracks.map((track) => {
                    const active = selectedAudioId === track.id;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => handleSelectAudioTrack(track.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                          active
                            ? 'bg-blue-600 border-blue-600 text-white font-bold'
                            : 'bg-white border-zinc-200 text-zinc-950 font-medium hover:border-blue-600 hover:text-blue-600'
                        }`}
                      >
                        {track.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {hlsQualities.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-xs font-bold uppercase text-zinc-950 shrink-0">
                    Quality:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectHlsQuality(-1)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                      selectedHlsLevel === -1
                        ? 'bg-blue-600 border-blue-600 text-white font-bold'
                        : 'bg-white border-zinc-200 text-zinc-950 font-medium hover:border-blue-600 hover:text-blue-600'
                    }`}
                  >
                    Auto
                  </button>
                  {hlsQualities.map((q) => {
                    const active = selectedHlsLevel === q.levelIndex;
                    return (
                      <button
                        key={q.levelIndex}
                        type="button"
                        onClick={() => handleSelectHlsQuality(q.levelIndex)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                          active
                            ? 'bg-blue-600 border-blue-600 text-white font-bold'
                            : 'bg-white border-zinc-200 text-zinc-950 font-medium hover:border-blue-600 hover:text-blue-600'
                        }`}
                      >
                        {q.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {hlsQualities.length === 0 &&
                activeServer?.qualities &&
                activeServer.qualities.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <span className="text-xs font-bold uppercase text-zinc-950 shrink-0">
                      Quality:
                    </span>
                    {activeServer.qualities.map((opt) => {
                      const active = effectiveUrl === opt.url;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => handleSelectDirectQuality(opt)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                            active
                              ? 'bg-blue-600 border-blue-600 text-white font-bold'
                              : 'bg-white border-zinc-200 text-zinc-950 font-medium hover:border-blue-600 hover:text-blue-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
