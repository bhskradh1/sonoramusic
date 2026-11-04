import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { YouTubePlayer } from './YouTubePlayer';
import { NowPlayingView } from './NowPlayingView';
import { AddToPlaylistButton } from './AddToPlaylistButton';
import { usePWA } from '@/hooks/use-pwa';
import { useBackgroundAudio } from '@/hooks/use-background-audio';
import { useYoutubeAudio } from '@/hooks/use-youtube-audio';

import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Heart,
  Repeat,
  Shuffle,
  Music2,
  ChevronUp
} from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  audioUrl?: string;
  audio_url?: string;
  source?: 'youtube_music' | string;
  playlistId?: string;
  duration?: string;
}

declare global {
  interface Window {
    MelodiyaNativeAudio?: { postMessage: (message: string) => void };
    MelodiyaNativeMedia?: { postMessage: (message: string) => void };
  }
}

interface MusicPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  /** Called when a song ends on its own (respects the autoplay setting). Falls back to onNext. */
  onTrackEnded?: () => void;
  offlineMode?: boolean;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  currentTrack,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  onTrackEnded,
  offlineMode = false,
}) => {
  const [volume, setVolume] = useState([75]);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [nativeCurrentTime, setNativeCurrentTime] = useState(0);
  const [nativeDuration, setNativeDuration] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const prevTrackIdRef = useRef<string | null>(null);
  const previousNativeAudioUrlRef = useRef<string | null>(null);
  const lastNativeExternalPlayingRef = useRef<boolean | null>(null);
  const playerRef = useRef<any>(null);
  const desiredPlayingRef = useRef(isPlaying);
  desiredPlayingRef.current = isPlaying;
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const { notifications: notificationsEnabled, normalizeVolume, autoOpenNowPlaying, defaultVolume, crossfade, crossfadeSeconds } = useSettings();
  const nativeAudioUrl = currentTrack?.audioUrl ?? currentTrack?.audio_url ?? null;
  const hasNativeAudioBridge = typeof window !== 'undefined' && Boolean(window.MelodiyaNativeAudio);
  // Every track in this app is a YouTube video ID. Tracks from playlists, liked
  // songs, history etc. don't carry source:'youtube_music', so don't depend on it:
  // anything without a direct audio URL must use the real audio path (HTML audio
  // or the Flutter native player), never the hidden YouTube iframe, which Android
  // suspends in the background.
  // If the audio API cannot deliver a track, fall back to the YouTube iframe for
  // that track so online music still plays (foreground only).
  const [streamFailedId, setStreamFailedId] = useState<string | null>(null);
  const needsYoutubeAudio = Boolean(
    offlineMode ||
    (currentTrack?.videoId && !nativeAudioUrl && streamFailedId !== currentTrack.videoId),
  );
  // In the Flutter Android wrapper, both online YouTube streams and saved
  // IndexedDB Blobs are played by just_audio so Android can keep them alive
  // through its foreground media service. Browsers/PWAs use HTMLAudioElement.
  const useNativeAudio = Boolean(hasNativeAudioBridge && (nativeAudioUrl || needsYoutubeAudio));
  const useNativeYoutubeAudio = Boolean(useNativeAudio && needsYoutubeAudio);
  const useYoutubeStream = Boolean(needsYoutubeAudio && !useNativeAudio);
  const triggerNextTrackRef = useRef<() => void>(() => {});
  const sendNativeAudioCommand = useCallback((payload: Record<string, unknown>) => {
    try {
      if (!window.MelodiyaNativeAudio) return false;
      window.MelodiyaNativeAudio.postMessage(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  // The keep-alive layer remains active for browser/PWA playback, while the
  // selected catalogue track itself is played by the real audio element below.
  // In the Flutter app the native just_audio service keeps playback alive. The
  // silent <audio> loop would steal Android audio focus from it, so skip it there.
  useBackgroundAudio(isPlaying && !useNativeAudio);

  const youtubeAudio = useYoutubeAudio(
    needsYoutubeAudio && currentTrack ? {
      videoId: currentTrack.videoId,
      trackId: currentTrack.id,
      playlistId: currentTrack.playlistId,
      title: currentTrack.title,
      artist: currentTrack.artist,
      thumbnail: currentTrack.thumbnail,
    } : null,
    {
      enabled: needsYoutubeAudio,
      offlineOnly: offlineMode,
      nativePlayback: useNativeYoutubeAudio,
      isPlaying,
      volume: (normalizeVolume ? 75 : (isMuted ? 0 : volume[0])) / 100,
      onEnded: () => triggerNextTrackRef.current(),
      onPlaybackError: () => {
        if (!offlineMode && currentTrack?.videoId) {
          setStreamFailedId(currentTrack.videoId);
          return;
        }
        if (isPlaying) onPlayPause();
      },
    },
  );

  // Apply the saved default volume whenever the user changes it in Settings.
  useEffect(() => {
    setVolume([defaultVolume]);
  }, [defaultVolume]);
  
  const { 
    canInstall, 
    installPWA, 
    isInstalled, 
    requestNotificationPermission,
    showNotification,
    requestBackgroundSync 
  } = usePWA();

  // Check if current track is liked
  useEffect(() => {
    const checkLiked = async () => {
      if (!currentTrack || !user) { setIsLiked(false); return; }
      const { data } = await supabase
        .from('liked_songs')
        .select('id')
        .eq('user_id', user.id)
        .eq('youtube_video_id', currentTrack.videoId)
        .maybeSingle();
      setIsLiked(!!data);
    };
    checkLiked();
  }, [currentTrack?.videoId, user]);

  const handleToggleLike = useCallback(async () => {
    if (!currentTrack || !user) return;
    if (isLiked) {
      await supabase
        .from('liked_songs')
        .delete()
        .eq('user_id', user.id)
        .eq('youtube_video_id', currentTrack.videoId);
      setIsLiked(false);
      toast({ title: 'Removed from Liked Songs' });
    } else {
      await supabase
        .from('liked_songs')
        .insert({
          user_id: user.id,
          youtube_video_id: currentTrack.videoId,
          title: currentTrack.title,
          artist: currentTrack.artist,
          thumbnail_url: currentTrack.thumbnail,
        });
      setIsLiked(true);
      toast({ title: 'Added to Liked Songs' });
    }
  }, [currentTrack, user, isLiked, toast]);

  // Auto-open Now Playing on mobile when a new track starts
  useEffect(() => {
    if (currentTrack && currentTrack.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = currentTrack.id;
      if (isMobile && autoOpenNowPlaying) {
        setShowNowPlaying(true);
      }
    }
  }, [currentTrack, isMobile, autoOpenNowPlaying]);

  const handlePlayerReady = () => {
    setPlayerReady(true);
    if (currentTrack && desiredPlayingRef.current) {
      window.setTimeout(() => {
        if (desiredPlayingRef.current && playerRef.current && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        }
      }, 500);
    }
  };

  const handleStateChange = (state: number) => {
    if (state === 1) {
      setIsLoading(false);
    } else if (state === 3) {
      setIsLoading(true);
    } else if (state === -1 && currentTrack && desiredPlayingRef.current) {
      window.setTimeout(() => {
        if (desiredPlayingRef.current && playerRef.current && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        }
      }, 1000);
    } else if (state === 2 || state === 0) {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (useNativeAudio || useYoutubeStream) return;
    if (currentTrack && playerReady) {
      setIsLoading(true);
      if (isPlaying && playerRef.current && typeof playerRef.current.getVideoData === 'function') {
        const videoData = playerRef.current.getVideoData?.();
        const loadedVideoId = videoData?.video_id;
        if (loadedVideoId !== currentTrack.videoId) {
          playerRef.current.loadVideoById(currentTrack.videoId);
          window.setTimeout(() => {
            if (!desiredPlayingRef.current || !playerRef.current) return;
            playerRef.current.seekTo(0, true);
            playerRef.current.playVideo();
          }, 1000);
        } else {
          window.setTimeout(() => {
            if (!desiredPlayingRef.current || !playerRef.current) return;
            playerRef.current.seekTo(currentTime, true);
            playerRef.current.playVideo();
          }, 100);
        }
      }
    }
  }, [currentTrack, isPlaying, playerReady, useNativeAudio, useYoutubeStream]);

  const endTriggeredRef = useRef(false);

  // Reset end-triggered flag when track changes
  useEffect(() => {
    endTriggeredRef.current = false;
  }, [currentTrack?.videoId]);

  const triggerNextTrack = () => {
    if (endTriggeredRef.current) return;
    endTriggeredRef.current = true;
    setCurrentTime(0);
    setIsLoading(false);
    if (isRepeat) {
      endTriggeredRef.current = false;
      if (useYoutubeStream) {
        youtubeAudio.seek(0);
        if (isPlaying) void youtubeAudio.play();
      } else if (useNativeAudio) {
        sendNativeAudioCommand({ command: 'seek', position: 0 });
        sendNativeAudioCommand({ command: 'play' });
      } else if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(0, true);
        playerRef.current.playVideo();
      }
    } else {
      (onTrackEnded ?? onNext)();
    }
  };
  triggerNextTrackRef.current = triggerNextTrack;

  useEffect(() => {
    if (!needsYoutubeAudio || !youtubeAudio.error) return;
    toast({
      title: 'YouTube Music playback failed',
      description: youtubeAudio.error,
      variant: 'destructive',
    });
  }, [needsYoutubeAudio, youtubeAudio.error, toast]);

  // Apply the same fade/volume settings to the streamed audio element that
  // the embedded YouTube player receives.
  useEffect(() => {
    if (!useYoutubeStream || youtubeAudio.duration <= 0) return;
    const baseVolume = normalizeVolume ? 75 : (isMuted ? 0 : volume[0]);
    const remaining = youtubeAudio.duration - youtubeAudio.currentTime;
    const fadeFactor = crossfade && crossfadeSeconds > 0 && remaining <= crossfadeSeconds
      ? Math.max(0, Math.min(1, remaining / crossfadeSeconds))
      : 1;
    youtubeAudio.setVolume((baseVolume * fadeFactor) / 100);
  }, [
    useYoutubeStream,
    youtubeAudio.currentTime,
    youtubeAudio.duration,
    youtubeAudio.setVolume,
    normalizeVolume,
    isMuted,
    volume,
    crossfade,
    crossfadeSeconds,
  ]);

  const handleTimeUpdate = (current: number, total: number) => {
    setCurrentTime(current);
    setDuration(total);

    // One YouTube player cannot overlap tracks, so this is a fade-out rather
    // than a true overlapping crossfade.
    if (!useNativeAudio && playerRef.current?.setVolume && total > 0) {
      const baseVolume = normalizeVolume ? 75 : (isMuted ? 0 : volume[0]);
      const remaining = total - current;
      const fadeFactor = crossfade && crossfadeSeconds > 0 && remaining <= crossfadeSeconds
        ? Math.max(0, Math.min(1, remaining / crossfadeSeconds))
        : 1;
      playerRef.current.setVolume(Math.round(baseVolume * fadeFactor));
    }

    if (total > 0 && current > 0 && (total - current) < 1.5 && isPlaying) {
      triggerNextTrack();
    }
  };

  const handleVideoEnd = () => {
    triggerNextTrack();
  };

  useEffect(() => {
    const previousUrl = previousNativeAudioUrlRef.current;
    if (!useNativeAudio || !nativeAudioUrl || !currentTrack) {
      if (previousUrl) sendNativeAudioCommand({ command: 'stop' });
      previousNativeAudioUrlRef.current = null;
      lastNativeExternalPlayingRef.current = null;
      return;
    }

    if (previousUrl !== nativeAudioUrl) {
      previousNativeAudioUrlRef.current = nativeAudioUrl;
      setNativeCurrentTime(0);
      setNativeDuration(0);
      setIsLoading(true);
      sendNativeAudioCommand({
        command: 'load',
        url: nativeAudioUrl,
        title: currentTrack.title,
        artist: currentTrack.artist,
        artwork: currentTrack.thumbnail,
        autoplay: isPlaying,
      });
    } else {
      sendNativeAudioCommand({ command: isPlaying ? 'play' : 'pause' });
    }
  }, [
    useNativeAudio,
    nativeAudioUrl,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.thumbnail,
    isPlaying,
    sendNativeAudioCommand,
  ]);

  useEffect(() => {
    if (!useNativeAudio) return;
    const handleNativeAudioState = (event: Event) => {
      const detail = (event as CustomEvent<{
        event?: string;
        playing?: boolean;
        position?: number;
        duration?: number;
        processingState?: string;
        syncPlaying?: boolean;
        message?: string;
      }>).detail;
      if (!detail) return;

      if (detail.event === 'ended') {
        triggerNextTrack();
        return;
      }
      if (detail.event === 'error') {
        setIsLoading(false);
        if (!offlineMode && currentTrack?.videoId) setStreamFailedId(currentTrack.videoId);
        toast({
          title: 'Native audio could not be played',
          description: detail.message || 'Check that the audio URL is a valid, accessible HTTPS stream.',
          variant: 'destructive',
        });
        return;
      }

      if (typeof detail.position === 'number') setNativeCurrentTime(detail.position);
      if (typeof detail.duration === 'number') setNativeDuration(detail.duration);
      setIsLoading(detail.processingState === 'loading' || detail.processingState === 'buffering');

      if (detail.syncPlaying && typeof detail.playing === 'boolean') {
        if (detail.playing === isPlaying) {
          lastNativeExternalPlayingRef.current = null;
        } else if (lastNativeExternalPlayingRef.current !== detail.playing) {
          lastNativeExternalPlayingRef.current = detail.playing;
          onPlayPause();
        }
      }
    };

    window.addEventListener('melodiya-native-audio-state', handleNativeAudioState);
    return () => window.removeEventListener('melodiya-native-audio-state', handleNativeAudioState);
  }, [useNativeAudio, isPlaying, onPlayPause, toast, triggerNextTrack, offlineMode, currentTrack?.videoId]);

  useEffect(() => {
    const handleMusicAction = (event: CustomEvent) => {
      const { action } = event.detail;
      switch (action) {
        case 'play': if (!isPlaying) onPlayPause(); break;
        case 'pause': if (isPlaying) onPlayPause(); break;
        case 'next': onNext(); break;
        case 'previous': onPrevious(); break;
      }
    };
    window.addEventListener('music-action', handleMusicAction as EventListener);
    return () => window.removeEventListener('music-action', handleMusicAction as EventListener);
  }, [isPlaying, onPlayPause, onNext, onPrevious]);

  // Always expose current track metadata, including for direct YouTube Music
  // streams and the native-player bridge. Action handlers use refs so the
  // OS can invoke the latest app-level playback state while the PWA is hidden.
  const mediaControlsRef = useRef({
    isPlaying,
    onPlayPause,
    onNext,
    onPrevious,
    play: () => {},
    pause: () => {},
    seek: (_seconds: number) => {},
  });
  mediaControlsRef.current = {
    isPlaying,
    onPlayPause,
    onNext,
    onPrevious,
    play: () => { if (needsYoutubeAudio) void youtubeAudio.play(); },
    pause: () => { if (needsYoutubeAudio) youtubeAudio.pause(); },
    seek: (seconds: number) => {
      if (needsYoutubeAudio) {
        youtubeAudio.seek(seconds);
      } else if (useNativeAudio) {
        sendNativeAudioCommand({ command: 'seek', position: seconds });
      } else if (playerRef.current?.seekTo) {
        playerRef.current.seekTo(seconds, true);
        setCurrentTime(seconds);
      }
    },
  };

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => {
        const controls = mediaControlsRef.current;
        if (!controls.isPlaying) {
          controls.play();
          controls.onPlayPause();
        }
      }],
      ['pause', () => {
        const controls = mediaControlsRef.current;
        if (controls.isPlaying) {
          controls.pause();
          controls.onPlayPause();
        }
      }],
      ['previoustrack', () => mediaControlsRef.current.onPrevious()],
      ['nexttrack', () => mediaControlsRef.current.onNext()],
      ['stop', () => {
        const controls = mediaControlsRef.current;
        if (controls.isPlaying) controls.onPlayPause();
      }],
      ['seekto', (details) => {
        if (typeof details.seekTime === 'number') mediaControlsRef.current.seek(details.seekTime);
      }],
    ];

    handlers.forEach(([action, handler]) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Browsers expose different subsets of Media Session actions.
      }
    });

    return () => {
      handlers.forEach(([action]) => {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Ignore unsupported action cleanup.
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: (needsYoutubeAudio || offlineMode) ? 'YouTube Music' : 'Sonora',
        artwork: [
          { src: currentTrack.thumbnail, sizes: '96x96', type: 'image/jpeg' },
          { src: currentTrack.thumbnail, sizes: '256x256', type: 'image/jpeg' },
          { src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
    }
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [currentTrack, isPlaying, useYoutubeStream, offlineMode]);

  // Publish metadata to the Android audio_service notification as well as
  // browser Media Session. The native service owns lock-screen controls while
  // the Flutter WebView is backgrounded.
  useEffect(() => {
    if (!window.MelodiyaNativeMedia) return;
    const payload = currentTrack && useNativeAudio
      ? {
          command: 'update',
          videoId: currentTrack.videoId,
          title: currentTrack.title,
          artist: currentTrack.artist,
          artwork: currentTrack.thumbnail,
          playing: isPlaying,
        }
      : { command: 'clear' };
    try {
      window.MelodiyaNativeMedia.postMessage(JSON.stringify(payload));
    } catch (error) {
      console.warn('Could not publish native playback metadata:', error);
    }
  }, [currentTrack, isPlaying, useNativeAudio]);

  // Keep the notification scrubber in sync
  useEffect(() => {
    const activeDuration = useNativeAudio
      ? nativeDuration
      : (useYoutubeStream ? youtubeAudio.duration : duration);
    const activePosition = useNativeAudio
      ? nativeCurrentTime
      : (useYoutubeStream ? youtubeAudio.currentTime : currentTime);
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && activeDuration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: activeDuration,
          position: Math.min(activePosition, activeDuration),
          playbackRate: 1,
        });
      } catch {
        /* ignore invalid position state */
      }
    }
  }, [
    currentTime,
    duration,
    nativeCurrentTime,
    nativeDuration,
    useNativeAudio,
    useYoutubeStream,
    youtubeAudio.currentTime,
    youtubeAudio.duration,
  ]);

  useEffect(() => {
    if (!currentTrack) return;
    if (isPlaying) requestBackgroundSync('background-audio-sync');
    if (notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      // Action buttons are handled by the service worker (public/sw.js), which
      // forwards the tap to the app as a 'music-action' event. The same tag
      // replaces the previous notification, so the middle button flips between
      // Pause and Play as the state changes.
      const options: any = {
        body: `${currentTrack.artist} • Sonora`,
        icon: currentTrack.thumbnail,
        badge: '/icon-192x192.png',
        tag: 'music-player',
        renotify: false,
        requireInteraction: false,
        silent: true,
        actions: [
          { action: 'previous', title: '⏮ Prev' },
          isPlaying
            ? { action: 'pause', title: '⏸ Pause' }
            : { action: 'play', title: '▶ Play' },
          { action: 'next', title: 'Next ⏭' },
        ],
      };
      showNotification(`${isPlaying ? 'Now Playing' : 'Paused'}: ${currentTrack.title}`, options);
    }
  }, [currentTrack, isPlaying, notificationsEnabled]);

  // Volume normalization: when enabled, set YouTube player to a fixed 75% volume
  useEffect(() => {
    if (useYoutubeStream) return;
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      if (normalizeVolume) {
        playerRef.current.setVolume(75);
      } else {
        playerRef.current.setVolume(isMuted ? 0 : volume[0]);
      }
    }
  }, [normalizeVolume, currentTrack, playerReady, useYoutubeStream]);

  // Send volume changes to the native player for direct streams.
  useEffect(() => {
    if (!useNativeAudio) return;
    sendNativeAudioCommand({ command: 'volume', volume: (isMuted ? 0 : volume[0]) / 100 });
  }, [useNativeAudio, currentTrack?.videoId, volume, isMuted, sendNativeAudioCommand]);

  // Sync volume to YouTube player
  useEffect(() => {
    if (useNativeAudio || useYoutubeStream) return;
    if (playerRef.current && typeof playerRef.current.setVolume === 'function' && !normalizeVolume) {
      playerRef.current.setVolume(isMuted ? 0 : volume[0]);
    }
  }, [volume, isMuted, normalizeVolume, useNativeAudio, useYoutubeStream]);

  const handleFirstPlay = async () => {
    // Always toggle playback first — notification permission must never block it.
    if (needsYoutubeAudio && !useNativeYoutubeAudio && !isPlaying) void youtubeAudio.play();
    onPlayPause();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await requestNotificationPermission();
      }
    } catch (err) {
      console.warn('Notification permission unavailable:', err);
    }
  };

  const handleProgressChange = (value: number[]) => {
    if (useNativeAudio && nativeDuration > 0) {
      const newTime = (value[0] / 100) * nativeDuration;
      sendNativeAudioCommand({ command: 'seek', position: newTime });
      setNativeCurrentTime(newTime);
      return;
    }
    if (useYoutubeStream && youtubeAudio.duration > 0) {
      const newTime = (value[0] / 100) * youtubeAudio.duration;
      youtubeAudio.seek(newTime);
      return;
    }
    if (playerRef.current && duration > 0) {
      const newTime = (value[0] / 100) * duration;
      try {
        playerRef.current.seekTo(newTime, true);
        setCurrentTime(newTime);
      } catch {
        setCurrentTime(newTime);
      }
    }
  };

  const displayedCurrentTime = useNativeAudio
    ? nativeCurrentTime
    : (useYoutubeStream ? youtubeAudio.currentTime : currentTime);
  const displayedDuration = useNativeAudio
    ? nativeDuration
    : (useYoutubeStream ? youtubeAudio.duration : duration);
  const activeIsLoading = useNativeAudio ? isLoading : (useYoutubeStream ? youtubeAudio.isLoading : isLoading);
  const progressPercentage = displayedDuration > 0 ? (displayedCurrentTime / displayedDuration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) {
    return null;
  }

  return (
    <>
      {/* HTML media element used for YouTube streams and IndexedDB offline Blobs. */}
      <audio
        ref={youtubeAudio.audioRef}
        className="hidden"
        preload={offlineMode ? 'auto' : 'none'}
        playsInline
        aria-hidden="true"
      />

      {/* Now Playing Full Screen View */}
      <NowPlayingView
        isVisible={showNowPlaying}
        onClose={() => setShowNowPlaying(false)}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isLoading={activeIsLoading}
        onPlayPause={handleFirstPlay}
        onNext={onNext}
        onPrevious={onPrevious}
        currentTime={displayedCurrentTime}
        duration={displayedDuration}
        onSeek={handleProgressChange}
        isRepeat={isRepeat}
        isShuffle={isShuffle}
        isLiked={isLiked}
        onToggleRepeat={() => setIsRepeat(!isRepeat)}
        onToggleShuffle={() => setIsShuffle(!isShuffle)}
        onToggleLike={handleToggleLike}
      />

      {/* Hidden YouTube Player */}
      {!useNativeAudio && !useYoutubeStream && (
        <YouTubePlayer
          ref={playerRef}
          videoId={currentTrack?.videoId || null}
          isPlaying={isPlaying}
          onReady={handlePlayerReady}
          onStateChange={handleStateChange}
          onEnd={handleVideoEnd}
          onTimeUpdate={handleTimeUpdate}
        />
      )}
      
      {/* Mobile Layout */}
      <div className="md:hidden glass-player relative px-3 py-2.5 flex flex-col gap-1.5 flex-shrink-0">
        {/* Clickable track info - opens Now Playing */}
        <div
          className="flex items-center gap-3 cursor-pointer active:opacity-80 transition-opacity"
          onClick={() => setShowNowPlaying(true)}
        >
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="size-12 rounded-xl border border-foreground/[0.09] object-cover shadow-md flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-sm truncate text-zinc-200">{currentTrack.title}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous track"
              className="grid size-10 place-items-center text-zinc-500 active:text-zinc-100"
              onClick={(e) => { e.stopPropagation(); onPrevious(); }}
            >
              <SkipBack className="w-[18px] h-[18px]" strokeWidth={1.7} />
            </button>
            <button
              type="button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="btn-silver size-11 !p-0 disabled:opacity-60"
              onClick={(e) => { e.stopPropagation(); handleFirstPlay(); }}
              disabled={activeIsLoading}
            >
              {activeIsLoading ? (
                <div className="w-5 h-5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-[18px] h-[18px] fill-current" />
              ) : (
                <Play className="w-[18px] h-[18px] ml-0.5 fill-current" />
              )}
            </button>
            <button
              type="button"
              aria-label="Next track"
              className="grid size-10 place-items-center text-zinc-500 active:text-zinc-100"
              onClick={(e) => { e.stopPropagation(); onNext(); }}
            >
              <SkipForward className="w-[18px] h-[18px]" strokeWidth={1.7} />
            </button>
          </div>
        </div>

        {/* Hairline progress (like / add-to-playlist live in Now Playing) */}
        <div className="absolute inset-x-0 top-0 h-px bg-foreground/10">
          <div
            className="h-full bg-zinc-300 transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex glass-player h-24 px-6 items-center justify-between">
        {/* Track Info - Clickable */}
        <div 
          className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setShowNowPlaying(true)}
        >
          <div className="relative group">
            <img
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              className="w-12 h-12 rounded-xl border border-foreground/[0.09] object-cover shadow-md"
            />
            <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ChevronUp className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{currentTrack.title}</h4>
            <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
          <AddToPlaylistButton track={currentTrack} />
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${isLiked ? 'text-signal' : 'text-muted-foreground'}`}
            onClick={(e) => { e.stopPropagation(); handleToggleLike(); }}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
          </Button>
        </div>

        {/* Player Controls */}
        <div className="flex flex-col items-center gap-2 flex-1 max-w-md">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm"
              className={`h-8 w-8 p-0 ${isShuffle ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setIsShuffle(!isShuffle)}>
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm"
              className="h-8 w-8 p-0 text-foreground hover:text-primary"
              onClick={onPrevious}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button size="sm"
              className="btn-silver h-10 w-10 !p-0 hover:opacity-90"
              onClick={handleFirstPlay} disabled={activeIsLoading}>
              {activeIsLoading ? (
                <div className="w-5 h-5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 text-zinc-950 fill-current" />
              ) : (
                <Play className="w-5 h-5 text-zinc-950 ml-0.5 fill-current" />
              )}
            </Button>
            <Button variant="ghost" size="sm"
              className="h-8 w-8 p-0 text-foreground hover:text-primary"
              onClick={onNext}>
              <SkipForward className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm"
              className={`h-8 w-8 p-0 ${isRepeat ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setIsRepeat(!isRepeat)}>
              <Repeat className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-muted-foreground">{formatTime(displayedCurrentTime)}</span>
            <Slider value={[progressPercentage]} onValueChange={handleProgressChange} max={100} step={0.1} className="flex-1" />
            <span className="text-xs text-muted-foreground">{formatTime(displayedDuration)}</span>
          </div>
        </div>

        {/* Volume & Lyrics */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          <Button variant="ghost" size="sm"
            className={`h-8 w-8 p-0 ${showNowPlaying ? 'text-primary' : 'text-muted-foreground'} hover:text-primary`}
            onClick={() => setShowNowPlaying(!showNowPlaying)} title="Now Playing">
            <Music2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMuted(!isMuted)}>
            {isMuted || volume[0] === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Slider value={isMuted ? [0] : volume} onValueChange={setVolume} max={100} step={1} className="w-24" />
        </div>
      </div>
    </>
  );
};
