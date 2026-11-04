import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { getOfflineTrack } from '@/lib/offlineLibrary';
import { resolveYoutubeAudioStream } from '@/lib/youtubeAudioApi';

declare global {
  interface Window {
    MelodiyaNativeAudio?: { postMessage: (message: string) => void };
  }
}

export interface YoutubeAudioTrack {
  videoId: string;
  trackId?: string;
  playlistId?: string;
  title?: string;
  artist?: string;
  thumbnail?: string;
}

interface UseYoutubeAudioOptions {
  enabled: boolean;
  isPlaying: boolean;
  volume: number;
  /** When true, only a Blob saved in IndexedDB may be used. */
  offlineOnly?: boolean;
  /** Route playback through the Flutter Android just_audio service. */
  nativePlayback?: boolean;
  onEnded?: () => void;
  onPlaybackError?: () => void;
}

interface UseYoutubeAudioResult {
  audioRef: ((node: HTMLAudioElement | null) => void) & { current: HTMLAudioElement | null };
  isLoading: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
  play: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
}

const postNativeAudioCommand = (payload: Record<string, unknown>): boolean => {
  if (typeof window === 'undefined' || !window.MelodiyaNativeAudio) return false;
  try {
    window.MelodiyaNativeAudio.postMessage(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

/**
 * Resolves YouTube Music audio streams, plays saved IndexedDB Blobs offline,
 * and hands both online and downloaded audio to the Flutter native player when
 * running inside the Sonora Android wrapper. Ordinary browsers keep HTML audio.
 */
export const useYoutubeAudio = (
  track: YoutubeAudioTrack | null,
  {
    enabled,
    isPlaying,
    volume,
    offlineOnly = false,
    nativePlayback = false,
    onEnded,
    onPlaybackError,
  }: UseYoutubeAudioOptions,
): UseYoutubeAudioResult => {
  const audioObjRef = useRef<HTMLAudioElement | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  // Callback ref: re-runs effects when the <audio> element mounts later.
  const audioRef = useMemo(() => {
    const cb = ((node: HTMLAudioElement | null) => {
      audioObjRef.current = node;
      setAudioEl(node);
    }) as ((node: HTMLAudioElement | null) => void) & { current: HTMLAudioElement | null };
    Object.defineProperty(cb, 'current', { get: () => audioObjRef.current, set: (v) => { audioObjRef.current = v; } });
    return cb;
  }, []);
  const isPlayingRef = useRef(isPlaying);
  const nativeActiveRef = useRef(false);
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
    const audio = audioEl;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime || 0);
      if (!audio.paused && audio.readyState >= 3) setIsLoading(false);
    };
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
  }, [offlineOnly, audioEl]);

  useEffect(() => {
    const audio = audioEl;
    if (audio) audio.volume = Math.max(0, Math.min(1, volume));
    if (nativePlayback && nativeActiveRef.current) {
      postNativeAudioCommand({ command: 'volume', volume: Math.max(0, Math.min(1, volume)) });
    }
  }, [volume, nativePlayback, audioEl]);

  useEffect(() => {
    const audio = audioEl;
    if (!audio) return;

    if (!enabled || !track?.videoId) {
      if (nativeActiveRef.current) postNativeAudioCommand({ command: 'stop' });
      nativeActiveRef.current = false;
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
    nativeActiveRef.current = false;
    setIsLoading(true);
    setError(null);
    setCurrentTime(0);
    setDuration(0);

    const loadAudio = async () => {
      try {
        if (offlineOnly) {
          if (!track.trackId) throw new Error('The selected track does not have an offline playlist record.');
          const record = await getOfflineTrack(track.trackId, track.playlistId);
          if (!record) throw new Error('This track has not been downloaded for offline playback.');
          if (controller.signal.aborted) return;

          if (nativePlayback) {
            const dataBase64 = await blobToBase64(record.blob);
            if (controller.signal.aborted) return;
            const sent = postNativeAudioCommand({
              command: 'loadBytes',
              dataBase64,
              mimeType: record.mime_type || record.blob.type || 'audio/mp4',
              videoId: record.video_id,
              title: track.title || record.title,
              artist: track.artist || record.artist,
              artwork: track.thumbnail || record.thumbnail_base64,
              autoplay: isPlayingRef.current,
            });
            if (!sent) throw new Error('The Android native audio bridge is unavailable. Reopen the installed Sonora Android app.');
            nativeActiveRef.current = true;
            setIsLoading(true);
            return;
          }

          objectUrl = URL.createObjectURL(record.blob);
          audio.src = objectUrl;
        } else {
          const resolved = await resolveYoutubeAudioStream(track.videoId, controller.signal);
          if (controller.signal.aborted) return;

          if (nativePlayback) {
            const sent = postNativeAudioCommand({
              command: 'load',
              url: resolved.streamUrl,
              videoId: track.videoId,
              title: track.title || 'Unknown track',
              artist: track.artist || 'Unknown artist',
              artwork: track.thumbnail || '',
              autoplay: isPlayingRef.current,
            });
            if (!sent) throw new Error('The Android native audio bridge is unavailable. Reopen the installed Sonora Android app.');
            nativeActiveRef.current = true;
            setIsLoading(true);
            return;
          }

          audio.src = resolved.streamUrl;
        }

        if (controller.signal.aborted) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return;
        }
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
      if (nativeActiveRef.current) postNativeAudioCommand({ command: 'stop' });
      nativeActiveRef.current = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    enabled,
    offlineOnly,
    nativePlayback,
    track?.videoId,
    track?.trackId,
    track?.playlistId,
    track?.title,
    track?.artist,
    track?.thumbnail,
    audioEl,
  ]);

  useEffect(() => {
    const audio = audioObjRef.current;
    if (!enabled) return;
    if (nativePlayback) {
      if (nativeActiveRef.current) {
        postNativeAudioCommand({ command: isPlaying ? 'play' : 'pause' });
      }
      return;
    }
    if (!audio?.src) return;
    if (isPlaying) {
      audio.play().catch((playError: unknown) => {
        setError(playError instanceof Error ? playError.message : 'Playback was blocked by the browser.');
        onPlaybackErrorRef.current?.();
      });
    } else {
      audio.pause();
    }
  }, [enabled, isPlaying, nativePlayback, track?.videoId, audioEl]);

  const play = useCallback(async () => {
    if (nativePlayback) {
      if (!nativeActiveRef.current) {
        setError('The audio stream is still loading.');
        return;
      }
      if (!postNativeAudioCommand({ command: 'play' })) {
        setError('The Android native audio service is unavailable.');
        onPlaybackErrorRef.current?.();
      }
      return;
    }

    const audio = audioObjRef.current;
    if (!audio?.src) {
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
  }, [nativePlayback]);

  const pause = useCallback(() => {
    if (nativePlayback) {
      if (nativeActiveRef.current) postNativeAudioCommand({ command: 'pause' });
      return;
    }
    audioRef.current?.pause();
  }, [nativePlayback]);

  const seek = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    if (nativePlayback) {
      if (nativeActiveRef.current) postNativeAudioCommand({ command: 'seek', position: Math.max(0, seconds) });
      return;
    }
    const audio = audioObjRef.current;
    if (!audio) return;
    const bounded = Math.max(0, audio.duration ? Math.min(seconds, audio.duration) : seconds);
    audio.currentTime = bounded;
    setCurrentTime(bounded);
  }, [nativePlayback]);

  const setVolume = useCallback((nextVolume: number) => {
    const bounded = Math.max(0, Math.min(1, nextVolume));
    if (nativePlayback) {
      if (nativeActiveRef.current) postNativeAudioCommand({ command: 'volume', volume: bounded });
      return;
    }
    if (audioRef.current) audioRef.current.volume = bounded;
  }, [nativePlayback]);

  return { audioRef, isLoading, currentTime, duration, error, play, pause, seek, setVolume };
};
