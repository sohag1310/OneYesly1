export interface StreamSubtitle {
  label: string;
  lang: string;
  url: string;
}

export interface StreamQualityOption {
  label: string;
  url: string;
  kind: 'mp4' | 'hls';
}

export interface StreamServer {
  name: string;
  url: string;
  kind?: 'hls' | 'mp4' | 'iframe';
  subtitles?: StreamSubtitle[];
  qualities?: StreamQualityOption[];
  allowSandbox?: boolean;
}

export interface Episode {
  number: number;
  title: string;
  duration: string;
  durationSeconds: number;
  videoUrl: string;
  episodeUrl?: string; // ToonStream episode URL resolved via /api/toonstream/episode
  synopsis: string;
}

export interface Season {
  seasonNumber: number;
  name: string;
  year: number;
  episodes: Episode[];
}

export type SectionCategory =
  | 'trending_large'
  | 'featured_large'
  | 'hindi_dubbed'
  | 'popular'
  | 'action'
  | 'fantasy'
  | 'scifi'
  | 'movies';

export interface AnimeItem {
  id: string;
  slug?: string;
  pageUrl?: string; // ToonStream series/movie URL resolved via /api/toonstream/series
  firstEpUrl?: string;
  title: string;
  japaneseTitle: string;
  posterUrl: string;
  bannerUrl?: string;
  synopsis: string;
  type: 'TV Series' | 'Movie' | 'OVA';
  year: number;
  score: string;
  studio: string;
  status: 'Completed' | 'Ongoing';
  duration: string;
  genres: string[];
  audioLanguages: string[];
  category: SectionCategory;
  isHero?: boolean;
  seasons: Season[];
}
