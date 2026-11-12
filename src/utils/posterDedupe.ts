import { AnimeItem } from '../types/anime';

/**
 * PosterDeduplicator: Tracks which anime posters have been used
 * so that the same poster never appears twice across different sections.
 */
export class PosterDeduplicator {
  private usedIds = new Set<string>();
  private usedPosterUrls = new Set<string>();

  has(item: AnimeItem): boolean {
    if (this.usedIds.has(item.id)) return true;
    const normalizedUrl = this.normalizeUrl(item.posterUrl);
    if (normalizedUrl && this.usedPosterUrls.has(normalizedUrl)) return true;
    return false;
  }

  mark(item: AnimeItem): void {
    this.usedIds.add(item.id);
    const normalizedUrl = this.normalizeUrl(item.posterUrl);
    if (normalizedUrl) this.usedPosterUrls.add(normalizedUrl);
  }

  takeUnique(items: AnimeItem[], limit: number): AnimeItem[] {
    const result: AnimeItem[] = [];
    for (const item of items) {
      if (result.length >= limit) break;
      if (!this.has(item)) {
        this.mark(item);
        result.push(item);
      }
    }
    return result;
  }

  private normalizeUrl(url: string): string {
    if (!url) return '';
    // Strip query params and size variants for dedup comparison
    try {
      const u = new URL(url, 'https://placeholder.local');
      return u.pathname
        .replace(/\/t\/p\/w\d+\//i, '/t/p/NORM/')
        .replace(/\/w\d+\//i, '/wNORM/');
    } catch {
      return url.split('?')[0];
    }
  }
}
