/**
 * scoreTitleMatch — Scores how well `query` matches a given anime title/slug.
 *
 * Returns a positive integer score when matched, 0 when there is no match.
 * Higher scores indicate a stronger / more relevant match.
 *
 * Matching tiers (highest → lowest priority):
 *   100 – Exact full title match (case-insensitive)
 *    90 – Title starts with query
 *    80 – Every query word appears in the title (all-word match)
 *    70 – Acronym match (first letters of each title word spell the query)
 *    60 – Any query word 3+ chars is found inside the title
 *    50 – Slug / alternate title fallback using the same tiers above
 *     0 – No match
 */
export function scoreTitleMatch(
  title: string,
  slugOrAlt: string | undefined,
  query: string
): number {
  if (!title || !query) return 0;

  const t = title.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  // ── Primary: score against the main title ──────────────────────────────────

  // Tier 1: exact match
  if (t === q) return 100;

  // Tier 2: title starts with query
  if (t.startsWith(q)) return 90;

  // Tier 3: all query words appear in title
  const qWords = q.split(/\s+/).filter((w) => w.length > 0);
  const tWords = t.split(/\s+/).filter((w) => w.length > 0);

  if (qWords.length > 1) {
    const allMatch = qWords.every((qw) => t.includes(qw));
    if (allMatch) return 80;
  }

  // Tier 4: acronym match — e.g. "aot" matches "Attack on Titan"
  if (q.length >= 2 && q.length <= 6) {
    const acronym = tWords.map((w) => w[0]).join('');
    if (acronym.startsWith(q) || acronym === q) return 70;
  }

  // Tier 5: any single query word (≥3 chars) is a substring of the title
  const anyWord = qWords.some((qw) => qw.length >= 3 && t.includes(qw));
  if (anyWord) return 60;

  // ── Secondary: score against slug / alternate title ────────────────────────
  const alt = (slugOrAlt || '').toLowerCase().replace(/-/g, ' ').trim();
  if (alt && alt !== t) {
    if (alt === q) return 50;
    if (alt.startsWith(q)) return 45;
    const altWords = alt.split(/\s+/).filter((w) => w.length > 0);
    if (qWords.length > 1 && qWords.every((qw) => alt.includes(qw))) return 42;
    if (q.length >= 2 && q.length <= 6) {
      const altAcronym = altWords.map((w) => w[0]).join('');
      if (altAcronym.startsWith(q) || altAcronym === q) return 40;
    }
    if (qWords.some((qw) => qw.length >= 3 && alt.includes(qw))) return 35;
  }

  return 0;
}
