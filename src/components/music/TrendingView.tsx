import React, { useEffect, useState } from 'react';
import { Play, Music, Loader2, RefreshCw } from 'lucide-react';
import { fetchWeeklyTrending, getWeekKey } from '@/lib/trending';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface TrendingViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
}

export const TrendingView: React.FC<TrendingViewProps> = ({ onPlayTrack }) => {
  const [trendingSongs, setTrendingSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (force = false) => {
    setLoading(true);
    try {
      setTrendingSongs(await fetchWeeklyTrending(force));
    } catch (err) {
      console.error('Error fetching trending:', err);
      setTrendingSongs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading this week's trending songs...</p>
        </div>
      </div>
    );
  }

  const formatDuration = (d?: string) => d ?? '';

  return (
    <div className="mx-auto max-w-[92rem] px-5 pb-32 pt-5 md:px-10 md:pt-8">
      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-3">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">Global signal</p>
          <h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Trending this week</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            The records moving fastest right now. Chart week {getWeekKey()}, refreshed every Monday.
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh chart"
          onClick={() => load(true)}
          className="grid size-10 shrink-0 place-items-center rounded-full border border-foreground/10 text-muted-foreground transition-colors hover:text-zinc-100"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {trendingSongs.length > 0 ? (
        <>
          {/* Ranked chart */}
          <div className="overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]">
            {trendingSongs.map((track, index) => (
              <button
                key={track.id}
                onClick={() => onPlayTrack(track, trendingSongs)}
                className="group grid w-full grid-cols-[1.75rem_3rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-foreground/[0.06] px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-foreground/[0.04] md:grid-cols-[2rem_2.75rem_minmax(0,1fr)_4rem_2rem] md:gap-4 md:px-4"
              >
                <span className="text-[10px] text-zinc-600">{String(index + 1).padStart(2, '0')}</span>
                <span className="relative block">
                  <img src={track.thumbnail} alt="" loading="lazy" className="size-11 rounded-lg border border-foreground/[0.09] object-cover grayscale-[.3] md:size-11" />
                  <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="ml-0.5 h-4 w-4 fill-current text-zinc-100" />
                  </span>
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-medium text-zinc-200">{track.title}</strong>
                  <small className="mt-0.5 block truncate text-xs text-muted-foreground">{track.artist}</small>
                </span>
                <span className="hidden text-[10px] text-zinc-600 md:block">{formatDuration(track.duration)}</span>
                <span className="grid size-8 place-items-center rounded-full bg-zinc-200 text-zinc-950 opacity-0 transition-opacity group-hover:opacity-100 max-md:hidden">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] px-6 py-14 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-foreground/10 bg-foreground/5 text-muted-foreground">
            <Music className="w-5 h-5" />
          </div>
          <h3 className="text-lg text-zinc-200">Could not load trending songs</h3>
          <button type="button" onClick={() => load(true)} className="btn-ghost-pill mt-5 px-5 py-2.5 text-xs">Try again</button>
        </div>
      )}
    </div>
  );
};
