import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { getOfflineTrack } from '@/lib/offlineLibrary';

export interface YoutubeAudioTrack {
  videoId: string;
  trackId?: string;
  playlistId?: string;
}

interface YoutubeAudioResponse {
  streamUrl?: string;
  error?: string;
}

interface UseYoutubeAudioOptions {
  enabled: boolean;
  isPlaying: boolean;
  volume: number;
  /** When true, only a Blob saved in IndexedDB may be used. */
  offlineOnly?: boolean;
  onEnded?: () => void;
  onPlaybackError?: () => void;
}

interface UseYoutubeAudioResult {
  audioRef: RefObject<HTMLAudioElement>;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
  play: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
}

const getAudioApiUrl = (): string => {
  const configured = import.meta.env.VITE_YTMUSIC_AUDIO_API_URL?.trim();
  return configured || 'https://melodiya-your-sound.vercel.app/api/youtube-audio';
};

/**
 * Resolves online YouTube Music audio streams and, while offline, plays the
 * exact Blob persisted for the selected playlist track in IndexedDB.
 */
export const useYoutubeAudio = (
  track: YoutubeAudioTrack | null,
  {
    enabled,
    isPlaying,
    volume,
    offlineOnly = false,
    onEnded,
    onPlaybackError,
  }: UseYoutubeAudioOptions,
): UseYoutubeAudioResult => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const isPlayingRef = useRef(isPlaying);
  const onEndedRef = useRef(onEnded);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  isPlayingRef.current = isPlaying;
  onEndedRef.current = onEnded;
  onPlaybackErrorRef.current = onPlaybackError;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime || 0);
    const updateDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleLoading = () => setIsLoading(true);
    const handleReady = () => setIsLoading(false);
    const handleEnded = () => {
      setIsLoading(false);
      onEndedRef.current?.();
    };
    const handleError = () => {
      if (audio.error?.code === 1) return;
      setIsLoading(false);
      setError(offlineOnly
        ? 'This track is not available in the offline download.'
        : 'The audio stream could not be played. Please try another track.');
      onPlaybackErrorRef.current?.();
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('loadstart', handleLoading);
    audio.addEventListener('waiting', handleLoading);
    audio.addEventListener('canplay', handleReady);
    audio.addEventListener('playing', handleReady);
    audio.addEventListener('pause', handleReady);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('loadstart', handleLoading);
      audio.removeEventListener('waiting', handleLoading);
      audio.removeEventListener('canplay', handleReady);
      audio.removeEventListener('playing', handleReady);
      audio.removeEventListener('pause', handleReady);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [offlineOnly]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!enabled || !track?.videoId) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setIsLoading(false);
      setCurrentTime(0);
      setDuration(0);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setIsLoading(true);
    setError(null);
    setCurrentTime(0);
    setDuration(0);

    const loadAudio = async () => {
      try {
        let sourceUrl: string;
        if (offlineOnly) {
          if (!track.trackId) throw new Error('The selected track does not have an offline playlist record.');
          const record = await getOfflineTrack(track.trackId, track.playlistId);
          if (!record) throw new Error('This track has not been downloaded for offline playback.');
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(record.blob);
          sourceUrl = objectUrl;
        } else {
          const apiUrl = getAudioApiUrl();
          const separator = apiUrl.includes('?') ? '&' : '?';
          const response = await fetch(
            `${apiUrl}${separator}id=${encodeURIComponent(track.videoId)}`,
            { signal: controller.signal, cache: 'no-store' },
          );
          const payload = (await response.json().catch(() => ({}))) as YoutubeAudioResponse;
          if (!response.ok || !payload.streamUrl) {
            throw new Error(payload.error || `Audio stream request failed (${response.status})`);
          }
          if (controller.signal.aborted) return;
          sourceUrl = new URL(
            payload.streamUrl,
            apiUrl.startsWith('http') ? apiUrl : window.location.origin,
          ).toString();
        }

        if (controller.signal.aborted) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return;
        }
        audio.src = sourceUrl;
        audio.load();
        setIsLoading(true);
        if (isPlayingRef.current) {
          try {
            await audio.play();
          } catch (playError) {
            if (!controller.signal.aborted) {
              setError(playError instanceof Error ? playError.message : 'Playback was blocked by the browser.');
              setIsLoading(false);
              onPlaybackErrorRef.current?.();
            }
          }
        }
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setIsLoading(false);
        setError(requestError instanceof Error ? requestError.message : 'Could not load this audio stream.');
        onPlaybackErrorRef.current?.();
      }
    };

    void loadAudio();
    return () => {
      controller.abort();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, offlineOnly, track?.videoId, track?.trackId, track?.playlistId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !enabled || !audio.src) return;
    if (isPlaying) {
      audio.play().catch((playError: unknown) => {
        setError(playError instanceof Error ? playError.message : 'Playback was blocked by the browser.');
        onPlaybackErrorRef.current?.();
      });
    } else {
      audio.pause();
    }
  }, [enabled, isPlaying, track?.videoId]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src) {
      setError('The audio stream is still loading.');
      return;
    }
    try {
      await audio.play();
      setError(null);
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : 'Playback was blocked by the browser.');
      onPlaybackErrorRef.current?.();
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const bounded = Math.max(0, audio.duration ? Math.min(seconds, audio.duration) : seconds);
    audio.currentTime = bounded;
    setCurrentTime(bounded);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, nextVolume));
  }, []);

  return { audioRef, isLoading, currentTime, duration, error, play, pause, seek, setVolume };
};
