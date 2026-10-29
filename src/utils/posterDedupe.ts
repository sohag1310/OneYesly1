import { AnimeItem } from '../types/anime';

const GENERIC_FILENAMES = new Set([
  'cover.jpg',
  'cover.png',
  'poster.jpg',
  'poster.png',
  'default.jpg',
  'thumb.jpg',
  'hero_anime_epic_1793052173700.jpg',
  'card_anime_cyber_1793052175785.jpg',
  'card_anime_fantasy_1793052175943.jpg',
  'card_anime_slice_life_1793052176114.jpg',
]);

export function extractPosterSignature(url?: string): string {
  if (!url) return '';
  const clean = url.trim().split('?')[0].split('#')[0].toLowerCase();
  if (!clean) return '';
  const filePart = clean.split('/').pop() || '';
  if (GENERIC_FILENAMES.has(filePart)) return '';
  return filePart.length >= 8 ? `img:${filePart}` : '';
}

export function normalizeBaseTitleSignature(title?: string): string {
  if (!title) return '';
  const stripped = title
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\bhindi\s*dub(?:bed)?\b/g, ' ')
    .replace(/\bmulti\s*audio\b/g, ' ')
    .replace(/\besub\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  return stripped.length >= 2 ? `title:${stripped}` : '';
}

export function getAnimeUniqueSignatures(item: {
  id?: string;
  slug?: string;
  title?: string;
  posterUrl?: string;
}): string[] {
  const sigs: string[] = [];
  if (item.id) sigs.push(`id:${item.id.toLowerCase()}`);
  if (item.slug) sigs.push(`slug:${item.slug.toLowerCase()}`);
  const imgSig = extractPosterSignature(item.posterUrl);
  if (imgSig) sigs.push(imgSig);
  const titleSig = normalizeBaseTitleSignature(item.title);
  if (titleSig) sigs.push(titleSig);
  return sigs;
}

export class PosterDeduplicator {
  private readonly seen = new Set<string>();

  has(item: {
    id?: string;
    slug?: string;
    title?: string;
    posterUrl?: string;
  }): boolean {
    const sigs = getAnimeUniqueSignatures(item);
    return sigs.some((s) => this.seen.has(s));
  }

  mark(item: {
    id?: string;
    slug?: string;
    title?: string;
    posterUrl?: string;
  }): void {
    const sigs = getAnimeUniqueSignatures(item);
    for (const s of sigs) {
      this.seen.add(s);
    }
  }

  takeUnique(pool: AnimeItem[], limit: number): AnimeItem[] {
    const picked: AnimeItem[] = [];
    for (const item of pool) {
      if (!item.posterUrl || !item.posterUrl.trim()) continue;
      if (this.has(item)) continue;
      this.mark(item);
      picked.push(item);
      if (picked.length >= limit) break;
    }
    return picked;
  }
}
