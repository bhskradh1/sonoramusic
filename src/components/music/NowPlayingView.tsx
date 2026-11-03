import { useSettings } from '@/contexts/SettingsContext';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AddToPlaylistButton } from './AddToPlaylistButton';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Repeat,
  Shuffle,
  ChevronDown,
  Volume2,
  VolumeX,
  Music2,
  Loader2,
  Gauge,
  X,
} from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

interface SyncedLine {
  time: number; // seconds
  text: string;
}

interface NowPlayingViewProps {
  isVisible: boolean;
  onClose: () => void;
  currentTrack: Track;
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  currentTime: number;
  duration: number;
  onSeek: (value: number[]) => void;
  isRepeat: boolean;
  isShuffle: boolean;
  isLiked: boolean;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleLike: () => void;
}

const SCROLL_SPEEDS = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
];

export const NowPlayingView: React.FC<NowPlayingViewProps> = ({
  isVisible,
  onClose,
  currentTrack,
  isPlaying,
  isLoading,
  onPlayPause,
  onNext,
  onPrevious,
  currentTime,
  duration,
  onSeek,
  isRepeat,
  isShuffle,
  isLiked,
  onToggleRepeat,
  onToggleShuffle,
  onToggleLike,
}) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [syncedLines, setSyncedLines] = useState<SyncedLine[] | null>(null);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const lyricsRequestIdRef = useRef(0);
  const activeLyricRef = useRef<HTMLParagraphElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activePreviewLyricRef = useRef<HTMLParagraphElement>(null);
  const previewLyricsContainerRef = useRef<HTMLDivElement>(null);
  const previewTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPreviewTapRef = useRef(0);
  const { lyricsAutoScroll } = useSettings();
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(lyricsAutoScroll);

  useEffect(() => {
    setAutoScrollEnabled(lyricsAutoScroll);
  }, [lyricsAutoScroll]);
  const [scrollSpeed, setScrollSpeed] = useState(1); // 1x default
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const plainScrollRef = useRef<number | null>(null);
  const userScrollRef = useRef(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse LRC timestamps such as [mm:ss], [mm:ss.xx], and multiple tags on one line.
  const parseSyncedLyrics = useCallback((lrc: string): SyncedLine[] => {
    const lines: SyncedLine[] = [];
    for (const rawLine of lrc.split('\n')) {
      const timestampPattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
      const timestamps = Array.from(rawLine.matchAll(timestampPattern));
      const text = rawLine.replace(timestampPattern, '').trim();
      if (!text || timestamps.length === 0) continue;

      for (const match of timestamps) {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
        if (Number.isFinite(minutes) && seconds < 60) {
          lines.push({ time: minutes * 60 + seconds + fraction, text });
        }
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }, []);

  // LRC timestamps are treated as the song timeline. A user-adjustable offset
  // compensates for different intros/edits in the official video being played.
  const activeLineIndex = useMemo(() => {
    if (!syncedLines || syncedLines.length === 0) return -1;
    const lyricTime = currentTime - lyricsOffset;
    let idx = -1;
    for (let i = 0; i < syncedLines.length; i++) {
      if (lyricTime >= syncedLines[i].time) idx = i;
      else break;
    }
    return idx;
  }, [syncedLines, currentTime, lyricsOffset]);

  // Manual scrolling pauses automatic following briefly in either lyrics mode.
  useEffect(() => {
    const containers = [
      previewLyricsContainerRef.current,
      lyricsContainerRef.current,
    ].filter((container): container is HTMLDivElement => !!container);
    if (containers.length === 0) return;

    const handleScroll = () => {
      if (!userScrollRef.current) {
        userScrollRef.current = true;
        setAutoScrollEnabled(false);
      }
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
      userScrollTimeoutRef.current = setTimeout(() => {
        userScrollRef.current = false;
        setAutoScrollEnabled(true);
      }, 4000);
    };

    containers.forEach((container) => {
      container.addEventListener('wheel', handleScroll, { passive: true });
      container.addEventListener('touchmove', handleScroll, { passive: true });
    });
    return () => {
      containers.forEach((container) => {
        container.removeEventListener('wheel', handleScroll);
        container.removeEventListener('touchmove', handleScroll);
      });
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, [showLyrics, syncedLines, plainLyrics]);

  // Keep the active lyric centered in compact mode by default, or in the
  // expanded lyrics view after the listener opens it.
  useEffect(() => {
    const container = showLyrics
      ? lyricsContainerRef.current
      : previewLyricsContainerRef.current;
    const activeLine = showLyrics
      ? activeLyricRef.current
      : activePreviewLyricRef.current;
    if (!isVisible || !container || !activeLine || !autoScrollEnabled || !isSynced) return;

    const containerRect = container.getBoundingClientRect();
    const lineRect = activeLine.getBoundingClientRect();
    const nextTop = container.scrollTop +
      (lineRect.top - containerRect.top) -
      (container.clientHeight / 2) +
      (lineRect.height / 2);

    container.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth',
    });
  }, [activeLineIndex, autoScrollEnabled, isSynced, showLyrics, isVisible]);

  // Auto-scroll for plain lyrics (no timestamps) — scroll at a constant rate
  useEffect(() => {
    if (plainScrollRef.current) {
      cancelAnimationFrame(plainScrollRef.current);
      plainScrollRef.current = null;
    }
    if (!autoScrollEnabled || !plainLyrics || !isVisible || isSynced || !isPlaying) return;
    const container = showLyrics
      ? lyricsContainerRef.current
      : previewLyricsContainerRef.current;
    if (!container) return;

    const pixelsPerSecond = (showLyrics ? 30 : 20) * scrollSpeed;
    let lastTime: number | null = null;

    const step = (timestamp: number) => {
      if (lastTime !== null) {
        const delta = (timestamp - lastTime) / 1000;
        container.scrollTop += pixelsPerSecond * delta;
      }
      lastTime = timestamp;
      plainScrollRef.current = requestAnimationFrame(step);
    };
    plainScrollRef.current = requestAnimationFrame(step);

    return () => {
      if (plainScrollRef.current) cancelAnimationFrame(plainScrollRef.current);
    };
  }, [autoScrollEnabled, plainLyrics, showLyrics, isSynced, isPlaying, scrollSpeed, isVisible]);

  const normalizeMatchText = (value: string) => value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:official|audio|video|lyrics?|hd|hq|4k|mv|topic|vevo)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  const tokenCoverage = (left: string, right: string) => {
    const leftTokens = new Set(normalizeMatchText(left).split(/\s+/).filter(Boolean));
    const rightTokens = new Set(normalizeMatchText(right).split(/\s+/).filter(Boolean));
    if (!leftTokens.size || !rightTokens.size) return 0;
    let shared = 0;
    for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
    return shared / Math.min(leftTokens.size, rightTokens.size);
  };

  const lyricsCandidateMatchesTrack = (candidate: any, expectedArtist: string, expectedTitle: string) => {
    const candidateTitle = String(candidate?.trackName || candidate?.track_name || candidate?.title || '');
    const candidateArtist = String(candidate?.artistName || candidate?.artist_name || candidate?.artist || '');
    if (!candidateTitle || !candidateArtist) return false;

    const targetTitle = normalizeMatchText(expectedTitle);
    const resultTitle = normalizeMatchText(candidateTitle);
    const titleClose = targetTitle === resultTitle ||
      targetTitle.includes(resultTitle) ||
      resultTitle.includes(targetTitle) ||
      tokenCoverage(expectedTitle, candidateTitle) >= 0.72;
    const targetArtist = normalizeMatchText(expectedArtist);
    const resultArtist = normalizeMatchText(candidateArtist);
    const artistClose = targetArtist === resultArtist ||
      targetArtist.includes(resultArtist) ||
      resultArtist.includes(targetArtist) ||
      tokenCoverage(expectedArtist, candidateArtist) >= 0.55;

    const candidateDuration = Number(candidate?.duration);
    const durationClose = !Number.isFinite(candidateDuration) ||
      candidateDuration <= 0 ||
      duration <= 0 ||
      Math.abs(candidateDuration - duration) <= Math.max(8, duration * 0.05);

    // Require title, artist and a reasonably close recording duration. This
    // rejects many alternate edits/remixes whose lyric timestamps drift.
    return titleClose && artistClose && durationClose;
  };

  const setLyricsFromLrc = (data: any): boolean => {
    if (data.syncedLyrics) {
      const parsed = parseSyncedLyrics(data.syncedLyrics);
      if (parsed.length > 0) {
        setSyncedLines(parsed);
        setPlainLyrics(null);
        setIsSynced(true);
        return true;
      }
    }
    if (data.plainLyrics) {
      setPlainLyrics(String(data.plainLyrics).trim());
      setSyncedLines(null);
      setIsSynced(false);
      return true;
    }
    return false;
  };

  const fetchLyrics = async () => {
    const requestId = ++lyricsRequestIdRef.current;
    const isLatestRequest = () => lyricsRequestIdRef.current === requestId;
    const cleanTitle = currentTrack.title
      .replace(/\(.*?\)/g, ' ')
      .replace(/\[.*?\]/g, ' ')
      .replace(/official\s*(music\s*)?video/gi, ' ')
      .replace(/lyrics?\s*video/gi, ' ')
      .replace(/\b(?:official audio|audio|hd|hq|4k|mv)\b/gi, ' ')
      .replace(/\|.*$/g, ' ')
      .replace(/\s*[-–—]\s*(?:official|lyrics|audio).*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cleanArtist = currentTrack.artist
      .replace(/\s*[-–—]\s*(?:topic|vevo|official).*$/i, ' ')
      .replace(/\b(?:official|topic|vevo)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    setLyricsLoading(true);
    setLyricsError(null);
    setSyncedLines(null);
    setPlainLyrics(null);
    setIsSynced(false);

    const tryExactMatch = async () => {
      try {
        const response = await fetch(
          `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`,
          { headers: { 'User-Agent': 'Sonora Music App v1.0' } }
        );
        if (!response.ok) return false;
        const data = await response.json();
        if (!isLatestRequest() || !lyricsCandidateMatchesTrack(data, cleanArtist, cleanTitle)) return false;
        return setLyricsFromLrc(data);
      } catch (error) {
        console.warn('LRCLIB exact match failed:', error);
        return false;
      }
    };

    const trySearchMatch = async () => {
      try {
        const response = await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}`,
          { headers: { 'User-Agent': 'Sonora Music App v1.0' } }
        );
        if (!response.ok) return false;
        const results = await response.json();
        if (!isLatestRequest() || !Array.isArray(results)) return false;

        const matching = results
          .filter((item: any) => lyricsCandidateMatchesTrack(item, cleanArtist, cleanTitle))
          .map((item: any) => ({
            item,
            score:
              tokenCoverage(cleanTitle, String(item.trackName || '')) * 2 +
              tokenCoverage(cleanArtist, String(item.artistName || '')) +
              (item.syncedLyrics ? 0.2 : 0),
          }))
          .sort((a: any, b: any) => b.score - a.score);

        const best = matching[0]?.item;
        return best ? setLyricsFromLrc(best) : false;
      } catch (error) {
        console.warn('LRCLIB search failed:', error);
        return false;
      }
    };

    try {
      if (cleanTitle && cleanArtist && await tryExactMatch()) return;
      if (cleanTitle && cleanArtist && await trySearchMatch()) return;
      if (isLatestRequest()) {
        setLyricsError('No verified lyrics match this recording yet. Try another official version or check again later.');
      }
    } finally {
      if (isLatestRequest()) setLyricsLoading(false);
    }
  };

  useEffect(() => {
    if (!isVisible) {
      lyricsRequestIdRef.current += 1;
      return;
    }
    void fetchLyrics();
    return () => {
      lyricsRequestIdRef.current += 1;
    };
  }, [currentTrack.videoId, isVisible]);

  useEffect(() => {
    if (!showLyrics && previewLyricsContainerRef.current) {
      previewLyricsContainerRef.current.scrollTop = 0;
    }
  }, [currentTrack.videoId, showLyrics, syncedLines]);

  useEffect(() => {
    const storageKey = `sonora-lyrics-offset:${currentTrack.videoId}`;
    try {
      const saved = Number(localStorage.getItem(storageKey));
      setLyricsOffset(Number.isFinite(saved) ? Math.max(-10, Math.min(10, saved)) : 0);
    } catch {
      setLyricsOffset(0);
    }
  }, [currentTrack.videoId]);

  const updateLyricsOffset = (nextOffset: number) => {
    const bounded = Math.max(-10, Math.min(10, Math.round(nextOffset * 10) / 10));
    setLyricsOffset(bounded);
    try {
      localStorage.setItem(`sonora-lyrics-offset:${currentTrack.videoId}`, String(bounded));
    } catch {
      // Timing can still be adjusted for this session when storage is unavailable.
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#070808] text-zinc-100 animate-in slide-in-from-bottom duration-300"
      style={{ background: '#070808' }}
    >

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-5 pt-2">
          <div className="min-w-0">
            <span className="text-[9px] font-medium uppercase tracking-[.28em] text-zinc-600">Now playing</span>
            <span className="ml-2 hidden truncate text-[10px] text-zinc-500 sm:inline">{currentTrack.artist}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
              aria-pressed={showLyrics}
              className={`h-10 gap-2 rounded-full border px-3 text-xs transition-colors ${showLyrics ? 'border-zinc-300/30 bg-zinc-100/10 text-zinc-100' : 'border-white/[0.08] bg-white/[0.025] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100'}`}
              onClick={() => setShowLyrics((visible) => !visible)}
            >
              <Music2 className="h-4 w-4" />
              Lyrics
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close player"
              className="h-10 w-10 rounded-full border border-white/[0.08] bg-white/[0.025] p-0 text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className={`flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-hidden px-5 pt-1 md:flex-row ${showLyrics ? 'items-stretch md:items-center' : 'items-center'}`}>
          {/* Artwork moves aside on desktop and yields the full phone panel to lyrics on mobile. */}
          <div className={`flex flex-col items-center gap-3 ${showLyrics ? 'hidden md:flex md:w-1/2' : 'w-full'} transition-all duration-300`}>
            <div className={`relative aspect-square ${showLyrics ? 'w-48 md:w-72' : 'w-[min(55vw,15rem)] md:w-72'} transition-all duration-300`}>
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className={`h-full w-full rounded-[1.6rem] border border-white/[0.09] object-cover grayscale-[.25] shadow-[0_22px_55px_rgba(0,0,0,.48)] ${isPlaying ? 'animate-pulse-subtle' : ''}`}
              />
              {isLoading && (
                <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                </div>
              )}
            </div>
            <div className="text-center w-full max-w-sm">
              <p className="mb-2 text-[9px] font-medium uppercase tracking-[.26em] text-zinc-600">After hours</p>
              <h2 className="text-2xl md:text-3xl font-medium tracking-[-.035em] truncate text-zinc-100">{currentTrack.title}</h2>
              <p className="mt-1.5 text-sm text-zinc-500">{currentTrack.artist}</p>
            </div>

            {!showLyrics && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Playing lyrics. Double-click to open full lyrics."
                onDoubleClick={() => setShowLyrics(true)}
                onTouchStart={(event) => {
                  const touch = event.changedTouches[0];
                  previewTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchEnd={(event) => {
                  const start = previewTouchStartRef.current;
                  previewTouchStartRef.current = null;
                  if (!start) return;
                  const touch = event.changedTouches[0];
                  const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
                  if (moved > 12) return;

                  const now = Date.now();
                  if (now - lastPreviewTapRef.current < 360) {
                    lastPreviewTapRef.current = 0;
                    setShowLyrics(true);
                  } else {
                    lastPreviewTapRef.current = now;
                  }
                }}
                onTouchCancel={() => {
                  previewTouchStartRef.current = null;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setShowLyrics(true);
                }}
                className="group mt-1 block w-full max-w-md select-none overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018))] px-4 py-2.5 text-left outline-none transition-colors hover:border-white/[0.16] hover:bg-white/[0.045] focus-visible:ring-2 focus-visible:ring-zinc-400"
                style={{ touchAction: 'manipulation' }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-[9px] font-semibold uppercase tracking-[.2em] text-zinc-600">Playing lyrics</span>
                  <span className="text-[9px] text-zinc-600 transition-colors group-hover:text-zinc-300">
                    Double-click to expand
                  </span>
                </div>
                <div
                  ref={previewLyricsContainerRef}
                  className="h-[4.1rem] overflow-y-auto overscroll-contain scroll-smooth scrollbar-none"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                >
                  {lyricsLoading && (
                    <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading lyrics…
                    </div>
                  )}
                  {lyricsError && !lyricsLoading && (
                    <p className="flex h-full items-center justify-center text-center text-xs text-zinc-500">
                      Lyrics unavailable for this recording
                    </p>
                  )}
                  {isSynced && syncedLines && !lyricsLoading && (
                    <div className="space-y-1 py-4">
                      {syncedLines.map((line, index) => (
                        <p
                          key={index}
                          ref={index === activeLineIndex ? activePreviewLyricRef : undefined}
                          className={`rounded-md px-2 py-1 text-xs leading-relaxed transition-colors duration-300 ${
                            index === activeLineIndex
                              ? 'bg-white/[0.07] font-medium text-zinc-100'
                              : index < activeLineIndex
                                ? 'text-zinc-700'
                                : 'text-zinc-500'
                          }`}
                        >
                          {line.text}
                        </p>
                      ))}
                    </div>
                  )}
                  {!isSynced && plainLyrics && !lyricsLoading && (
                    <div className="space-y-1 py-2">
                      {plainLyrics.split('\n').map((line, index) => (
                        <p
                          key={index}
                          ref={index === 0 ? activePreviewLyricRef : undefined}
                          className="px-2 py-0.5 text-xs leading-relaxed text-zinc-400"
                        >
                          {line || '\u00A0'}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[#111313] to-transparent" />
              </div>
            )}
          </div>

          {/* Lyrics Panel */}
          {showLyrics && (
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden animate-in fade-in slide-in-from-right duration-300 md:w-1/2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Music2 className="w-4 h-4 text-primary" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
                      Lyrics {isSynced ? <span className="ml-1 text-[10px] text-zinc-400">• Synced</span> : <span className="ml-1 text-[10px] text-zinc-600">• Plain text</span>}
                    </h3>
                    <p className="mt-1 truncate text-[10px] text-zinc-600">{currentTrack.title} · {currentTrack.artist}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isSynced && (
                    <div className="flex items-center rounded-full border border-white/[0.08] bg-white/[0.025] px-1">
                      <button
                        type="button"
                        aria-label="Show lyrics half a second earlier"
                        className="h-7 min-w-7 rounded-full px-1 text-[10px] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
                        onClick={() => updateLyricsOffset(lyricsOffset - 0.5)}
                      >
                        −0.5
                      </button>
                      <span className="min-w-12 text-center text-[9px] tabular-nums text-zinc-500">
                        {lyricsOffset > 0 ? '+' : ''}{lyricsOffset.toFixed(1)}s
                      </span>
                      <button
                        type="button"
                        aria-label="Delay lyrics half a second"
                        className="h-7 min-w-7 rounded-full px-1 text-[10px] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
                        onClick={() => updateLyricsOffset(lyricsOffset + 0.5)}
                      >
                        +0.5
                      </button>
                    </div>
                  )}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs text-zinc-500 hover:text-zinc-100"
                      onClick={() => setShowSpeedControl(!showSpeedControl)}
                      aria-label="Change plain lyrics scroll speed"
                    >
                      <Gauge className="h-3.5 w-3.5" />
                      {scrollSpeed}x
                    </Button>
                    {showSpeedControl && (
                      <div className="absolute right-0 top-full z-50 mt-1 flex gap-1 rounded-xl border border-white/10 bg-[#151717] p-2 shadow-xl">
                        {SCROLL_SPEEDS.map((s) => (
                          <Button
                            key={s.value}
                            variant={scrollSpeed === s.value ? 'default' : 'ghost'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setScrollSpeed(s.value);
                              setShowSpeedControl(false);
                            }}
                          >
                            {s.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div ref={lyricsContainerRef} className="min-h-0 flex-1 touch-pan-y overscroll-contain overflow-y-auto pr-1 scroll-smooth scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                {lyricsLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Finding lyrics...</p>
                  </div>
                )}

                {lyricsError && !lyricsLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Music2 className="w-12 h-12 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground">{lyricsError}</p>
                    <Button variant="outline" size="sm" onClick={fetchLyrics}>Try Again</Button>
                  </div>
                )}

                {/* Synced Lyrics with highlighting */}
                {isSynced && syncedLines && !lyricsLoading && (
                  <div className="space-y-1 py-8">
                    <div className="h-24" />
                    {syncedLines.map((line, i) => {
                      const isActive = i === activeLineIndex;
                      const isPast = i < activeLineIndex;
                      return (
                        <p
                          key={i}
                          ref={isActive ? activeLyricRef : undefined}
                          className={`
                            text-base md:text-xl leading-relaxed font-medium py-2 px-3 rounded-lg cursor-pointer
                            transition-all duration-300 ease-out
                            ${isActive
                              ? 'text-zinc-100 scale-[1.02] origin-left bg-white/[0.055]'
                              : isPast
                                ? 'text-zinc-700'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }
                          `}
                          style={{
                            transform: isActive ? 'scale(1.05)' : 'scale(1)',
                            textShadow: 'none',
                          }}
                          onClick={() => {
                            if (duration > 0) {
                              const seekPercent = (Math.max(0, line.time + lyricsOffset) / duration) * 100;
                              onSeek([seekPercent]);
                            }
                          }}
                        >
                          {line.text}
                        </p>
                      );
                    })}
                    <div className="h-48" />
                  </div>
                )}

                {/* Plain Lyrics (no timestamps) */}
                {!isSynced && plainLyrics && !lyricsLoading && (
                  <div className="space-y-0.5 pb-8">
                    {plainLyrics.split('\n').map((line, i) => (
                      <p
                        key={i}
                        className={`text-base md:text-lg leading-relaxed ${
                          line.trim() === '' ? 'h-4' : 'text-foreground/80 hover:text-primary transition-colors'
                        }`}
                      >
                        {line || '\u00A0'}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="shrink-0 border-t border-white/[0.06] bg-[#070808] px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 space-y-3">
          <div className="space-y-2">
            <Slider
              value={[progressPercentage]}
              onValueChange={onSeek}
              max={100}
              step={0.1}
              className="w-full [&>span:first-child]:bg-zinc-800 [&>span:first-child>span]:bg-zinc-200 [&>span[role=slider]]:border-zinc-200 [&>span[role=slider]]:bg-zinc-100 [&>span[role=slider]]:focus-visible:ring-zinc-400"
            />
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground font-mono">{formatTime(currentTime)}</span>
              <span className="text-xs text-muted-foreground font-mono">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-md items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              aria-label={isLiked ? 'Unlike song' : 'Like song'}
              className={`h-11 w-11 rounded-full p-0 ${isLiked ? 'text-zinc-100' : 'text-zinc-500'} hover:bg-white/[0.06] hover:text-zinc-100`}
              onClick={onToggleLike}
            >
              <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Previous track" className="h-11 w-11 rounded-full p-0 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100" onClick={onPrevious}>
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button size="lg" aria-label={isPlaying ? 'Pause' : 'Play'} className="h-[4.25rem] w-[4.25rem] rounded-full bg-zinc-100 p-0 text-zinc-950 shadow-[0_8px_25px_rgba(255,255,255,.12)] hover:bg-white" onClick={onPlayPause} disabled={isLoading}>
              {isLoading ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
              ) : isPlaying ? (
                <Pause className="h-7 w-7 fill-current" />
              ) : (
                <Play className="ml-1 h-7 w-7 fill-current" />
              )}
            </Button>
            <Button variant="ghost" size="sm" aria-label="Next track" className="h-11 w-11 rounded-full p-0 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100" onClick={onNext}>
              <SkipForward className="h-5 w-5" />
            </Button>
            <AddToPlaylistButton track={currentTrack} />
          </div>

          <div className={`mx-auto flex w-full max-w-xs items-center justify-center gap-8 pt-1 ${showLyrics ? 'hidden md:flex' : 'flex'}`}>
            <Button variant="ghost" size="sm" aria-label="Shuffle" className={`h-9 w-9 rounded-full p-0 ${isShuffle ? 'text-zinc-100' : 'text-zinc-600'} hover:bg-white/[0.06]`} onClick={onToggleShuffle}>
              <Shuffle className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Repeat" className={`h-9 w-9 rounded-full p-0 ${isRepeat ? 'text-zinc-100' : 'text-zinc-600'} hover:bg-white/[0.06]`} onClick={onToggleRepeat}>
              <Repeat className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
