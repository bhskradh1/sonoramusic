import { supabase } from '@/integrations/supabase/client';

export interface MelodiyaSearchTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration: string;
  source: 'youtube_music';
}

interface YtMusicSearchResponse {
  tracks?: unknown[];
  error?: string;
}

const SEARCH_CACHE_PREFIX = 'melodiya_verified_artist_songs_v3:';
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SEARCH_RESULTS = 20;
const inFlightSearches = new Map<string, Promise<MelodiyaSearchTrack[]>>();

const PRODUCTION_SEARCH_API =
  'https://melodiyayoursound.vercel.app/api/ytmusic-search';

const getSearchApiUrl = (): string => {
  const configured = import.meta.env.VITE_YTMUSIC_SEARCH_API_URL?.trim();
  if (configured) return configured;

  // The Sonora frontend may be hosted separately from the existing search API.
  // Use the stable API deployment by default; deployments can override it above.
  return PRODUCTION_SEARCH_API;
};

const normalizeTrack = (value: unknown): MelodiyaSearchTrack | null => {
  if (!value || typeof value !== 'object') return null;
  const track = value as Record<string, unknown>;
  const videoId = String(track.videoId || track.id || '').trim();
  const title = String(track.title || '').trim();
  if (!videoId || !title) return null;

  return {
    id: videoId,
    videoId,
    title,
    artist: String(track.artist || 'Unknown Artist').trim(),
    thumbnail: String(track.thumbnail || ''),
    duration: String(track.duration || 'Unknown'),
    source: 'youtube_music',
  };
};

const postMusicSearchApi = async (
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sign in to search YouTube Music');

  const response = await fetch(getSearchApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      String(payload.error || `YouTube Music request failed (${response.status})`),
    );
  }
  return payload;
};

const searchYouTubeMusic = async (query: string): Promise<MelodiyaSearchTrack[]> => {
  const payload = await postMusicSearchApi({ action: 'search', query, limit: MAX_SEARCH_RESULTS });
  return Array.isArray(payload.tracks)
    ? payload.tracks.map(normalizeTrack).filter((track): track is MelodiyaSearchTrack => !!track)
    : [];
};

export interface MusicArtist {
  id: string;
  browseId: string;
  name: string;
  thumbnail: string;
  subscribers?: string;
  genre?: string;
}

export interface ArtistSongsResult {
  artist: string;
  tracks: MelodiyaSearchTrack[];
}

/** Discover artists from the listener's saved genre and language preferences. */
export const fetchPopularArtists = async (
  genres: string[],
  language: string,
  limit = 6,
): Promise<MusicArtist[]> => {
  const payload = await postMusicSearchApi({
    action: 'artists',
    genres: genres.slice(0, 3),
    language,
    limit: Math.max(1, Math.min(12, limit)),
  });

  if (!Array.isArray(payload.artists)) return [];
  return payload.artists
    .map((value): MusicArtist | null => {
      if (!value || typeof value !== 'object') return null;
      const artist = value as Record<string, unknown>;
      const browseId = String(artist.browseId || artist.id || '').trim();
      const name = String(artist.name || '').trim();
      if (!browseId.startsWith('UC') || !name) return null;
      return {
        id: browseId,
        browseId,
        name,
        thumbnail: String(artist.thumbnail || ''),
        subscribers: String(artist.subscribers || ''),
        genre: String(artist.genre || ''),
      };
    })
    .filter((artist): artist is MusicArtist => artist !== null);
};

/** Load an artist's official YouTube Music top-songs list in catalogue order. */
export const fetchArtistSongs = async (
  artistId: string,
  artistName: string,
  limit = 30,
): Promise<ArtistSongsResult> => {
  if (!artistId.startsWith('UC')) throw new Error('Invalid artist selection');
  const payload = await postMusicSearchApi({
    action: 'artist_songs',
    artistId,
    artistName,
    limit: Math.max(1, Math.min(50, limit)),
  });
  const tracks = Array.isArray(payload.tracks)
    ? payload.tracks.map(normalizeTrack).filter((track): track is MelodiyaSearchTrack => !!track)
    : [];
  return {
    artist: String(payload.artist || artistName),
    tracks,
  };
};

/**
 * Use only the YouTube Music artist/catalogue Songs feed. No fallback to
 * general YouTube video search is allowed because that can return uploads
 * from arbitrary channels, mixes and user-generated videos.
 */
const readSearchCache = (key: string): MelodiyaSearchTrack[] | null => {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_PREFIX + key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as {
      savedAt?: number;
      tracks?: MelodiyaSearchTrack[];
    };
    if (!cached.savedAt || Date.now() - cached.savedAt > SEARCH_CACHE_TTL_MS) {
      localStorage.removeItem(SEARCH_CACHE_PREFIX + key);
      return null;
    }
    return Array.isArray(cached.tracks) ? cached.tracks : null;
  } catch {
    return null;
  }
};

const writeSearchCache = (key: string, tracks: MelodiyaSearchTrack[]) => {
  try {
    localStorage.setItem(
      SEARCH_CACHE_PREFIX + key,
      JSON.stringify({ savedAt: Date.now(), tracks }),
    );
  } catch {
    // Search must still work when browser storage is full or unavailable.
  }
};

/**
 * Search only the YouTube Music artist/catalogue Songs feed.
 * Results are cached locally for 15 minutes to reduce repeat API requests.
 */
export const searchMelodiyaTracks = async (
  query: string,
): Promise<MelodiyaSearchTrack[]> => {
  const normalized = query.trim().replace(/\s+/g, ' ');
  if (!normalized) return [];

  const cacheKey = normalized.toLocaleLowerCase();
  const cached = readSearchCache(cacheKey);
  if (cached) return cached;

  const pending = inFlightSearches.get(cacheKey);
  if (pending) return pending;

  const request = searchYouTubeMusic(normalized)
    .then((tracks) => {
      writeSearchCache(cacheKey, tracks);
      return tracks;
    })
    .finally(() => {
      if (inFlightSearches.get(cacheKey) === request) {
        inFlightSearches.delete(cacheKey);
      }
    });

  inFlightSearches.set(cacheKey, request);
  return request;
};
