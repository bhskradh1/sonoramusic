import { useEffect, useRef } from 'react';

/**
 * Keeps audio alive when the app is minimised (Android WebView wrappers like
 * Median.co, Chrome PWA, mobile browsers).
 *
 * Two layers:
 * 1. A silent looping <audio> element owned by the page. Android grants audio
 *    focus (and shows the Media Session notification) only to a media element
 *    inside the page — the hidden YouTube iframe does not qualify. Keeping this
 *    element playing keeps the WebView in "playing audio" state so the OS does
 *    not suspend it on minimise.
 * 2. A Wake Lock (where supported) so aggressive power saving doesn't freeze
 *    the running timers.
 */

// 1 second of silence, 8kHz mono WAV.
const buildSilentWavUrl = () => {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1s
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples, true);
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128); // silence (8-bit unsigned centre)
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
};

export const useBackgroundAudio = (isPlaying: boolean) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Create the silent element once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = buildSilentWavUrl();
    urlRef.current = url;

    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.001; // must not be 0 — some WebViews drop audio focus at 0
    audio.preload = 'auto';
    (audio as any).playsInline = true;
    audio.setAttribute('playsinline', 'true');
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // Start / stop the silent loop with playback state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;

    const requestWakeLock = async () => {
      try {
        const nav: any = navigator;
        if (nav.wakeLock?.request && !wakeLockRef.current) {
          wakeLockRef.current = await nav.wakeLock.request('screen');
          wakeLockRef.current?.addEventListener?.('release', () => {
            wakeLockRef.current = null;
          });
        }
      } catch {
        /* wake lock is best-effort */
      }
    };

    const releaseWakeLock = () => {
      try {
        wakeLockRef.current?.release?.();
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null;
    };

    if (isPlaying) {
      audio.play().catch(() => {
        /* blocked until a user gesture — retried on the next play toggle */
      });
      void requestWakeLock();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else {
      audio.pause();
      releaseWakeLock();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }

    // Re-acquire the wake lock when the app comes back to the foreground.
    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible' && isPlaying) {
        void requestWakeLock();
        if (audio.paused) audio.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Watchdog: some WebViews pause the silent element on minimise; restart it.
    const keepAlive = window.setInterval(() => {
      if (isPlaying && audioRef.current?.paused) {
        audioRef.current.play().catch(() => {});
      }
    }, 3000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(keepAlive);
      releaseWakeLock();
    };
  }, [isPlaying]);
};
