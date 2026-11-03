import { searchMelodiyaTracks } from '@/lib/musicSearch';
import { LANGUAGE_LABELS, type UserPreferences } from '@/contexts/PreferencesContext';

export interface RecTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

export interface RecommendationRow {
  key: string;
  title: string;
  subtitle: string;
  tracks: RecTrack[];
}

const CACHE_PREFIX = 'melodiya_recs_verified_artist_songs_v2_'; // invalidate results cached under the looser filter
const TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const inFlightSearches = new Map<string, Promise<RecTrack[]>>();

const cacheKey = (q: string) => `${CACHE_PREFIX}${q.toLowerCase().replace(/\s+/g, '_')}`;

const readCache = (q: string): RecTrack[] | null => {
  try {
    const raw = localStorage.getItem(cacheKey(q));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) return null;
    return Array.isArray(parsed.tracks) && parsed.tracks.length ? parsed.tracks : null;
  } catch {
    return null;
  }
};

const writeCache = (q: string, tracks: RecTrack[]) => {
  try {
    localStorage.setItem(cacheKey(q), JSON.stringify({ at: Date.now(), tracks }));
  } catch {
    /* quota */
  }
};

export const searchTracks = async (
  query: string,
  useCache = true,
  allowNetwork = false
): Promise<RecTrack[]> => {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalizedQuery) return [];

  if (useCache) {
    const cached = readCache(normalizedQuery);
    if (cached) return cached;
  }

  // Cache-only is the default so automatic page loads never consume YouTube quota.
  if (!allowNetwork) return [];

  const pending = inFlightSearches.get(normalizedQuery);
  if (pending) return pending;

  const request = (async () => {
    try {
      const tracks = await searchMelodiyaTracks(normalizedQuery);
      if (tracks.length) writeCache(normalizedQuery, tracks);
      return tracks;
    } catch (e) {
      console.error('Recommendation fetch failed:', normalizedQuery, e);
      return [];
    }
  })();

  inFlightSearches.set(normalizedQuery, request);
  try {
    return await request;
  } finally {
    if (inFlightSearches.get(normalizedQuery) === request) {
      inFlightSearches.delete(normalizedQuery);
    }
  }
};

/** Builds the personalized row definitions from the user's saved preferences. */
export const buildRecommendationQueries = (prefs: UserPreferences) => {
  const lang = LANGUAGE_LABELS[prefs.preferred_language] || '';
  const genres = (prefs.favorite_genres || []).slice(0, 4);

  const rows: { key: string; title: string; subtitle: string; query: string }[] = [];

  if (genres.length) {
    rows.push({
      key: 'mixed',
      title: 'Made for you',
      subtitle: `Based on ${genres.slice(0, 3).join(', ')}`,
      query: `best ${genres.slice(0, 2).join(' and ')} songs ${lang} 2026`,
    });
    genres.forEach((g) =>
      rows.push({
        key: `genre-${g}`,
        title: `${g} picks`,
        subtitle: `Because you like ${g}`,
        query: `top ${g} songs ${lang}`,
      })
    );
  } else {
    rows.push({
      key: 'starter',
      title: 'Made for you',
      subtitle: 'Pick your favourite genres in Settings to sharpen this',
      query: `popular ${lang} songs right now`,
    });
  }

  if (lang) {
    rows.push({
      key: `lang-${prefs.preferred_language}`,
      title: `${lang} hits`,
      subtitle: 'In your preferred language',
      query: `top ${lang} songs 2026`,
    });
  }

  return rows;
};

export const fetchPersonalizedRows = async (
  prefs: UserPreferences,
  force = false,
  allowNetwork = false
): Promise<RecommendationRow[]> => {
  const defs = buildRecommendationQueries(prefs);
  const results = await Promise.all(defs.map((d) => searchTracks(d.query, !force, allowNetwork)));
  return defs
    .map((d, i) => ({ key: d.key, title: d.title, subtitle: d.subtitle, tracks: results[i].slice(0, 14) }))
    .filter((r) => r.tracks.length > 0);
};

/** Flat suggestion list used by Search when the query box is empty. */
export const fetchPreferenceSuggestions = async (
  prefs: UserPreferences,
  allowNetwork = false
): Promise<RecTrack[]> => {
  const rows = await fetchPersonalizedRows(prefs, false, allowNetwork);
  const seen = new Set<string>();
  const out: RecTrack[] = [];
  const maxLen = Math.max(...rows.map((r) => r.tracks.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const row of rows) {
      const t = row.tracks[i];
      if (t?.videoId && !seen.has(t.videoId)) {
        seen.add(t.videoId);
        out.push(t);
      }
    }
  }
  return out.slice(0, 20);
};
