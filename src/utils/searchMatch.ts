/**
 * Smart anime title relevance scorer.
 * Understands 2-3 letter prefixes, word-boundary prefixes, spaceless titles,
 * popular anime initials/acronyms, and minor spelling typos—while strictly
 * rejecting unrelated substring noise.
 */

export function normalizeText(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistanceAtMost(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];

    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }

    if (rowMin > maxDist) return maxDist + 1;
  }

  return dp[b.length];
}

const COMMON_STOP_WORDS = new Set(['the', 'of', 'in', 'to', 'and', 'a', 'no', 'ni', 'wa']);

export function scoreTitleMatch(
  title: string,
  secondaryTitle: string | undefined,
  query: string
): number {
  const normQ = normalizeText(query);
  if (!normQ) return 0;

  const compactQ = normQ.replace(/\s+/g, '');
  const qWords = normQ.split(/\s+/).filter(Boolean);

  const candidates = [title, secondaryTitle || '']
    .map((t) => normalizeText(t))
    .filter(Boolean);

  let bestScore = 0;

  for (const cand of candidates) {
    const compactCand = cand.replace(/\s+/g, '');
    const candWords = cand.split(/\s+/).filter(Boolean);
    const lengthPenalty = Math.min(40, cand.length * 0.4);

    // 1. Exact full title match
    if (cand === normQ || compactCand === compactQ) {
      bestScore = Math.max(bestScore, 1000);
      continue;
    }

    // 2. Title starts directly with the typed query (e.g., "na" -> "Naruto", "so" -> "Solo Leveling")
    if (cand.startsWith(normQ) || compactCand.startsWith(compactQ)) {
      bestScore = Math.max(bestScore, 920 - lengthPenalty);
      continue;
    }

    // 3. Every query token prefixes a word in the title (e.g., "lev" -> "Solo Leveling", "nar shi" -> "Naruto Shippuden")
    const allQueryWordsPrefixTitleWords = qWords.every((qw) =>
      candWords.some((cw) => cw.startsWith(qw))
    );
    if (allQueryWordsPrefixTitleWords) {
      const firstWordMatches = candWords[0]?.startsWith(qWords[0]) ? 60 : 0;
      bestScore = Math.max(bestScore, 780 + firstWordMatches - lengthPenalty);
      continue;
    }

    // 4. Acronym / Initials match (e.g., "jjk" -> "Jujutsu Kaisen", "aot" -> "Attack on Titan", "opm" -> "One Punch Man")
    if (compactQ.length >= 2 && qWords.length === 1 && candWords.length >= 2) {
      const allInitials = candWords.map((w) => w[0]).join('');
      const sigInitials = candWords
        .filter((w) => !COMMON_STOP_WORDS.has(w))
        .map((w) => w[0])
        .join('');

      if (allInitials.startsWith(compactQ) || sigInitials.startsWith(compactQ)) {
        bestScore = Math.max(
          bestScore,
          compactQ.length >= 3 ? 720 - lengthPenalty : 580 - lengthPenalty
        );
        continue;
      }
    }

    // 5. Substring match inside title (ONLY when user typed at least 3 characters, avoiding 2-letter noise)
    if (compactQ.length >= 3 && (cand.includes(normQ) || compactCand.includes(compactQ))) {
      bestScore = Math.max(bestScore, 520 - lengthPenalty);
      continue;
    }

    // 6. Fuzzy typo tolerance on word prefixes for 3+ character words (e.g., "narto" -> "naruto", "dmon" -> "demon")
    if (compactQ.length >= 3) {
      let fuzzyMatchedAll = true;
      for (const qw of qWords) {
        if (qw.length < 3) {
          if (!candWords.some((cw) => cw.startsWith(qw))) {
            fuzzyMatchedAll = false;
            break;
          }
          continue;
        }
        const maxDist = qw.length >= 6 ? 2 : 1;
        const matchedWord = candWords.some((cw) => {
          const slice = cw.slice(0, Math.min(cw.length, qw.length + 1));
          return (
            editDistanceAtMost(qw, slice, maxDist) <= maxDist ||
            editDistanceAtMost(qw, cw.slice(0, qw.length), maxDist) <= maxDist
          );
        });
        if (!matchedWord) {
          fuzzyMatchedAll = false;
          break;
        }
      }

      if (fuzzyMatchedAll) {
        bestScore = Math.max(bestScore, 360 - lengthPenalty);
      }
    }
  }

  return bestScore;
}
