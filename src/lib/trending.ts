import { searchMelodiyaTracks } from '@/lib/musicSearch';

export interface TrendingTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

/** ISO-style year + week number, e.g. "2026-W34". Rolls over every Monday. */
export const getWeekKey = (d = new Date()) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const WEEKLY_SEEDS = [
  'top trending songs this week',
  'billboard hot 100 this week',
  'viral hits this week',
  'most streamed songs this week',
  'new music releases this week',
  'youtube music charts this week',
];

const getWeeklyQuery = (offset = 0) => {
  const weekKey = getWeekKey();
  const weekNumber = parseInt(weekKey.split('W')[1], 10);
  const seed = WEEKLY_SEEDS[(weekNumber + offset) % WEEKLY_SEEDS.length];
  return `${seed} ${weekKey}`;
};

const CACHE_PREFIX = 'trending_week_verified_artist_songs_v2_'; // invalidate results cached under the looser filter
let weeklyTrendingRequest: Promise<TrendingTrack[]> | null = null;

const readCache = (key: string): TrendingTrack[] | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as TrendingTrack[]) : null;
  } catch {
    return null;
  }
};

/**
 * Trending tracks for the current calendar week. Results are cached per week so
 * everyone sees the same chart until the next Monday rollover.
 */
export const fetchWeeklyTrending = async (force = false): Promise<TrendingTrack[]> => {
  const cacheKey = `${CACHE_PREFIX}${getWeekKey()}`;
  const cached = readCache(cacheKey);
  if (!force && cached) return cached;

  // Share one weekly request across Home/Trending mounts and React re-renders.
  if (weeklyTrendingRequest) return weeklyTrendingRequest;

  weeklyTrendingRequest = (async () => {
    // One chart query only; do not fan out to multiple YouTube searches.
    const tracks = (await searchMelodiyaTracks(getWeeklyQuery(0))) as TrendingTrack[];
    if (tracks.length) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(tracks));
      } catch {
        /* ignore storage errors */
      }
    }
    return tracks;
  })();

  try {
    return await weeklyTrendingRequest;
  } finally {
    weeklyTrendingRequest = null;
  }
};
