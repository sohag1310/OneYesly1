export type SectionCategory =
  | 'featured_large'
  | 'trending_large'
  | 'hindi_dubbed'
  | 'popular'
  | 'action'
  | 'fantasy'
  | 'scifi'
  | 'movies';

export interface Episode {
  number: number;
  title: string;
  duration: string;
  durationSeconds: number;
  videoUrl: string;
  episodeUrl?: string;
  synopsis?: string;
}

export interface Season {
  seasonNumber: number;
  name: string;
  year: number;
  episodes: Episode[];
}

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
  kind: 'hls' | 'mp4' | 'iframe';
  allowSandbox?: boolean;
  subtitles?: StreamSubtitle[];
  qualities?: StreamQualityOption[];
  isBackgroundOnly?: boolean;
}

export interface AnimeItem {
  id: string;
  slug?: string;
  pageUrl?: string;
  firstEpUrl?: string;
  title: string;
  japaneseTitle: string;
  posterUrl: string;
  bannerUrl: string;
  synopsis: string;
  type: string;
  year: number;
  score: string;
  studio: string;
  status: string;
  duration: string;
  genres: string[];
  audioLanguages: string[];
  category: SectionCategory;
  isHero: boolean;
  seasons: Season[];
}
