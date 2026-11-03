// Pure helpers for YouTube-style "Up next" recommendations.
// No network access in this file, so everything here is easy to unit test.

export interface Candidate {
  id: string;
  title: string; // clean title (may be Last.fm's canonical title)
  artist: string;
  thumbnail: string;
  videoId: string;
  duration: string;
  /** Original YouTube title. Filters use this, because `title` may be replaced
   *  by Last.fm's clean title (which would hide words like "cover" or "slowed"). */
  rawTitle?: string;
  /** Position in the YouTube search results (0 = best). */
  relevanceRank?: number;
  viewCount?: number;
  viewsPerDay?: number;
  likeRatio?: number;
  vibeMatch?: number;
  genreMatch?: number;
  /** Last.fm similarity score between 0 and 1. */
  lastFmMatch?: number;
  /** MusicBrainz recording id supplied by Last.fm when known. */
  musicBrainzId?: string;
  /** 1 when the upload looks official (Topic / VEVO / label), else a low value. */
  officialSignal?: number;
}

/** Score used for candidates Last.fm did not recognise (shared with index.ts). */
export const UNMATCHED_LASTFM_SCORE = 0.2;
/** Only the most recent artists are blocked, so small genres don't run dry. */
export const RECENT_ARTIST_WINDOW = 8;

export const WEIGHTS = {
  lastFm: 0.38,
  relevance: 0.22,
  momentum: 0.12,
  popularity: 0.10,
  vibe: 0.07,
  official: 0.05,
  genre: 0.04,
  engagement: 0.02,
} as const; // sums to 1.00

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------
// Only strip clear "decoration" words. Words like "video", "music", "song" and
// "live" can be real title words ("Video Games"), so they are kept.
const NOISE =
  /\b(official(?:\s+(?:music\s+)?(?:video|audio))?|lyric(?:al)?\s+video|lyrics?|lyrical|visualizer|hd|4k|mv|remastered|feat|ft|featuring)\b/g;

export const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isSameNormalized = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  // Whole-word containment AND the short title must be at least half of the
  // long one. "Stay" != "Stayin Alive", "Love" != "Love Story", but
  // "Shape of You" == "Shape of You Ed Sheeran".
  return shorter.length >= 4 &&
    (' ' + longer + ' ').includes(' ' + shorter + ' ') &&
    shorter.length / longer.length >= 0.5;
};

export const isSameSong = (first: string, second: string): boolean =>
  isSameNormalized(normalizeTitle(first), normalizeTitle(second));

/** Covers, remixes, long mixes and other uploads we never want in an Up Next queue. */
export const BAD_WORDS =
  /\b(karaoke|instrumental|tutorial|lesson|non-?stop|jukebox|mashup|compilation|slowed|reverb|8d|sped up|nightcore|remix|status|reaction video)\b|\b\d+\s*hours?\s+(?:of|mix|songs|playlist|music)\b|\bcover(?:ed)?\s+(?:by|version)\b|[\(\[]\s*cover\s*[\)\]]|\b(?:dj|mega|party|hits|songs|music)\s+mix\b|\bmix\s+(?:19|20)\d\d\b/i;

// ---------------------------------------------------------------------------
// Mood / genre / language
// ---------------------------------------------------------------------------
const VIBE_RULES: Array<{ pattern: RegExp; query: string }> = [
  { pattern: /\b(romantic|love|lover|valentine|couple|affection)\b/i, query: 'romantic soulful love songs' },
  { pattern: /\b(sad|heartbreak|broken|emotional|tears|lonely|melancholy)\b/i, query: 'emotional sad melodic songs' },
  { pattern: /\b(chill|relax|relaxing|lofi|lo-fi|acoustic|soft|calm|peaceful)\b/i, query: 'chill mellow acoustic songs' },
  { pattern: /\b(party|dance|club|edm|electronic|dj|remix)\b/i, query: 'upbeat dance party hits' },
  { pattern: /\b(energetic|energy|workout|gym|anthem|hype|power)\b/i, query: 'energetic upbeat hits' },
  { pattern: /\b(rap|hip.?hop|trap|drill)\b/i, query: 'hip hop rap hits' },
  { pattern: /\b(devotional|bhajan|worship|spiritual|mantra)\b/i, query: 'devotional spiritual songs' },
  { pattern: /\b(folk|traditional|lok|lokgeet)\b/i, query: 'folk traditional songs' },
  { pattern: /\b(jazz|blues|soul|r.?&.?b)\b/i, query: 'soul r&b jazz songs' },
];

export const inferVibeTerms = (text: string): string[] =>
  VIBE_RULES.filter((rule) => rule.pattern.test(text)).slice(0, 2).map((rule) => rule.query);

const GENERIC_TOPICS = new Set(['music', 'entertainment', 'lifestyle', 'hobby', 'knowledge']);

/** YouTube topicCategories (Wikipedia URLs) -> readable genre, e.g. "Hip hop". */
export const genreFromTopics = (topics: string[] = []): string | null => {
  for (const url of topics) {
    let name = '';
    try {
      name = decodeURIComponent(url.split('/').pop() || '');
    } catch {
      name = url.split('/').pop() || '';
    }
    name = name.replace(/_/g, ' ').trim();
    const key = name.toLowerCase();
    if (!name || GENERIC_TOPICS.has(key) || key.startsWith('music of')) continue;
    return name.replace(/ music$/i, '');
  }
  return null;
};

const normalizeGenre = (genre: string): string => genre.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** "Hip-hop" matches "Hip hop" and "Hip hop / rap". */
export const genreMatches = (genre: string, wanted: string[]): boolean => {
  const g = normalizeGenre(genre);
  if (!g) return false;
  return wanted.map(normalizeGenre).filter(Boolean).some((w) =>
    w === g || (g.length >= 4 && w.includes(g)) || (w.length >= 4 && g.includes(w))
  );
};

const LANGS: Record<string, string> = {
  en: 'English', hi: 'Hindi', ne: 'Nepali', pa: 'Punjabi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu',
  ur: 'Urdu', mr: 'Marathi', gu: 'Gujarati', es: 'Spanish', pt: 'Portuguese', ko: 'Korean',
  ja: 'Japanese', ar: 'Arabic', fr: 'French', de: 'German', ru: 'Russian', tr: 'Turkish',
};

export const langFromCode = (code?: string): string | null =>
  code ? LANGS[code.toLowerCase().split('-')[0]] ?? null : null;

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------
export const parseISODuration = (iso: string): number => {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
};

export const formatDuration = (seconds: number): string =>
  String(Math.floor(seconds / 60)) + ':' + String(seconds % 60).padStart(2, '0');

// ---------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------
const normalizeArtist = (artist: string): string =>
  artist
    .toLowerCase()
    .replace(/\s*[-|]\s*topic$/i, '')
    .replace(/\b(official|vevo)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Labels / channels are not singers: blocking "T-Series" would block half of Bollywood. */
const LABEL_CHANNEL =
  /\b(records?|recordings?|music|entertainment|label|labels|films?|studios?|productions?|media|network|official|vevo|series|tips|saregama|zee|sony|universal|warner|tv|channel|company)\b/i;

export const isLabelChannel = (name: string): boolean => LABEL_CHANNEL.test(name);

/**
 * Split collaborations ("A feat. B", "A x B", "A & B") so a featured singer is
 * not recommended again. Commas and slashes are NOT split, which keeps names
 * like "Tyler, The Creator" and "AC/DC" in one piece.
 * Labels and channels return [] (they are never used for artist de-duplication).
 */
export const artistKeys = (artist: string): string[] => {
  const value = artist.trim();
  if (!value || isLabelChannel(value)) return [];
  if (/^r\s*&\s*b$/i.test(value)) return ['r&b'];
  return value
    .split(/\s+(?:feat(?:uring)?\.?|ft\.?|with)\s+|\s+x\s+|\s+&\s+|\s+and\s+/i)
    .map(normalizeArtist)
    .filter((name) => name.length >= 2);
};

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------
const normalizedLogValues = (values: number[]): number[] => {
  // With very few items, min-max scaling exaggerates tiny differences.
  if (values.length < 4) return values.map(() => 0.5);
  const logs = values.map((value) => Math.log1p(Math.max(0, value)));
  const minimum = Math.min(...logs);
  const maximum = Math.max(...logs);
  if (maximum - minimum < 0.000001) return values.map(() => 0.5);
  return logs.map((value) => (value - minimum) / (maximum - minimum));
};

/** Blend Last.fm similarity, search relevance, momentum, popularity and mood fit. */
export const rankRelated = (items: Candidate[]): Candidate[] => {
  if (items.length < 2) return items;

  const popularity = normalizedLogValues(items.map((item) => item.viewCount ?? 0));
  const momentum = normalizedLogValues(items.map((item) => item.viewsPerDay ?? 0));
  const engagement = normalizedLogValues(items.map((item) => item.likeRatio ?? 0));
  // relevanceRank counts positions in the ORIGINAL search results, so scale by
  // the largest rank seen (not by how many candidates survived filtering).
  const maxRank = Math.max(1, ...items.map((item, i) => item.relevanceRank ?? i));

  return items
    .map((item, index) => {
      const relevance = 1 - (item.relevanceRank ?? index) / maxRank;
      const score =
        relevance * WEIGHTS.relevance +
        (item.lastFmMatch ?? UNMATCHED_LASTFM_SCORE) * WEIGHTS.lastFm +
        momentum[index] * WEIGHTS.momentum +
        popularity[index] * WEIGHTS.popularity +
        (item.vibeMatch ?? 0.5) * WEIGHTS.vibe +
        (item.genreMatch ?? 0.5) * WEIGHTS.genre +
        (item.officialSignal ?? 0.2) * WEIGHTS.official +
        engagement[index] * WEIGHTS.engagement;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
};

/**
 * Pick the next songs: never repeat a song, never use covers/remixes/mixes,
 * and don't repeat a singer from the last few songs or inside the new batch.
 */
export const pickRelated = (
  items: Candidate[],
  opts: {
    currentTitle: string;
    currentArtist: string;
    excludeTitles?: string[];
    excludeVideoIds?: string[];
    excludeArtists?: string[]; // in play order, oldest first
    excludeMusicBrainzIds?: string[];
    limit?: number;
  },
): Candidate[] => {
  const seenTitles = [opts.currentTitle, ...(opts.excludeTitles || [])]
    .map(normalizeTitle)
    .filter(Boolean);
  const seenIds = new Set(opts.excludeVideoIds || []);
  const seenMusicBrainzIds = new Set((opts.excludeMusicBrainzIds || []).filter(Boolean));
  const recentArtists = (opts.excludeArtists || []).slice(-RECENT_ARTIST_WINDOW);
  const seenArtists = new Set([opts.currentArtist, ...recentArtists].flatMap(artistKeys));
  const out: Candidate[] = [];

  for (const candidate of rankRelated(items)) {
    if (!candidate.videoId || seenIds.has(candidate.videoId)) continue;
    if (candidate.musicBrainzId && seenMusicBrainzIds.has(candidate.musicBrainzId)) continue;
    if (BAD_WORDS.test(candidate.rawTitle ?? candidate.title)) continue;

    const normalized = normalizeTitle(candidate.title);
    if (normalized && seenTitles.some((title) => isSameNormalized(title, normalized))) continue;

    const names = artistKeys(candidate.artist);
    if (names.some((name) => seenArtists.has(name))) continue;

    seenIds.add(candidate.videoId);
    if (candidate.musicBrainzId) seenMusicBrainzIds.add(candidate.musicBrainzId);
    if (normalized) seenTitles.push(normalized);
    names.forEach((name) => seenArtists.add(name));
    out.push(candidate);

    if (out.length >= (opts.limit ?? 15)) break;
  }

  return out;
};

// ---------------------------------------------------------------------------
// Search query building
// ---------------------------------------------------------------------------
/** Make text safe to put inside a YouTube search query. */
export const cleanQueryText = (text: string, max = 50): string =>
  text
    .replace(/["'|()]/g, ' ')
    .replace(/(^|\s)-+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();

/**
 * Join query parts with " | " (OR) without ever cutting a part in the middle.
 * A part that does not fit is skipped, so shorter parts after it can still fit.
 */
export const joinQueryParts = (parts: string[], max = 400): string => {
  let query = '';
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    const next = query ? query + ' | ' + piece : piece;
    if (next.length > max) continue;
    query = next;
  }
  return query;
};