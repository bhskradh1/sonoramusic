import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Music2, Play, Sparkles } from 'lucide-react';
import { fetchArtistSongs, searchMelodiyaTracks, type MelodiyaSearchTrack, type MusicArtist } from '@/lib/musicSearch';

export interface MusicMood {
  id: string;
  title: string;
  query: string;
  subtitle: string;
  description: string;
}

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
  source?: 'youtube_music' | string;
}

interface MusicDiscoveryDetailViewProps {
  artist?: MusicArtist | null;
  mood?: MusicMood | null;
  onBack: () => void;
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
}

export const MusicDiscoveryDetailView: React.FC<MusicDiscoveryDetailViewProps> = ({
  artist,
  mood,
  onBack,
  onPlayTrack,
}) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [resolvedArtistName, setResolvedArtistName] = useState(artist?.name || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setTracks([]);
    try {
      let results: MelodiyaSearchTrack[] = [];
      if (artist) {
        const result = await fetchArtistSongs(artist.browseId, artist.name, 40);
        setResolvedArtistName(result.artist || artist.name);
        results = result.tracks;
      } else if (mood) {
        results = await searchMelodiyaTracks(mood.query);
      }
      setTracks(results as Track[]);
      if (results.length === 0) {
        setError(artist
          ? 'No official songs are available for this artist right now.'
          : 'No official tracks were found for this mood right now.');
      }
    } catch (err) {
      console.error('Could not load music discovery view:', err);
      setError('Could not load songs right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [artist?.browseId, artist?.name, mood?.id, mood?.query]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = artist ? resolvedArtistName || artist.name : mood?.title || 'Music';
  const eyebrow = artist ? 'Artist catalogue' : 'Your mood';
  const subtitle = artist
    ? 'Official songs · Most popular first'
    : mood?.description || mood?.subtitle || 'A collection chosen for this moment';
  const artwork = artist?.thumbnail;

  return (
    <div className="mx-auto min-h-full w-full max-w-4xl px-5 pb-32 pt-5 md:px-10 md:pt-8">
      <header className="mb-7 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.035] px-4 text-xs text-zinc-300 transition-colors hover:bg-foreground/[0.07] hover:text-zinc-100"
          aria-label="Back to Home"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <span className="text-[9px] font-semibold uppercase tracking-[.24em] text-zinc-600">SONORA</span>
      </header>

      <section className="mb-7 overflow-hidden rounded-[1.7rem] border border-foreground/[0.09] bg-[linear-gradient(135deg,#202322,#111313_58%,#090a0a)] p-5 shadow-[0_20px_60px_rgba(0,0,0,.25)] md:flex md:items-center md:gap-6 md:p-7">
        <div className="mx-auto mb-5 aspect-square w-36 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_35%_30%,#696e69,#242927_46%,#101212_82%)] md:mx-0 md:mb-0 md:w-44">
          {artwork ? (
            <img src={artwork} alt={title} className="h-full w-full object-cover grayscale-[.55] contrast-[1.08]" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[repeating-radial-gradient(circle_at_50%_50%,transparent_0_14px,rgba(255,255,255,.08)_15px,transparent_17px)] text-zinc-500">
              {artist ? <Music2 className="h-12 w-12" /> : <Sparkles className="h-12 w-12" />}
            </div>
          )}
        </div>
        <div className="min-w-0 text-center md:text-left">
          <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-zinc-500">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-.045em] text-zinc-100 md:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>
          <p className="mt-4 text-[10px] uppercase tracking-[.16em] text-zinc-600">
            {loading ? 'Finding songs…' : `${tracks.length} songs`}
          </p>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-zinc-600">
              {artist ? 'Artist chart' : 'Selected mood'}
            </p>
            <h2 className="mt-1 text-xl font-medium text-zinc-200">
              {artist ? 'Popular songs' : 'Songs for this mood'}
            </h2>
          </div>
          {tracks.length > 0 && !loading && (
            <button
              type="button"
              onClick={() => onPlayTrack(tracks[0], tracks)}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-zinc-100 px-4 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Play all
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] px-4 py-7 text-sm text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading official songs…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] px-5 py-10 text-center">
            <Music2 className="mx-auto mb-3 h-6 w-6 text-zinc-600" />
            <p className="text-sm text-zinc-400">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-full border border-foreground/15 px-4 py-2 text-xs text-zinc-300 transition-colors hover:bg-foreground/[0.06]"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]">
            {tracks.map((track, index) => (
              <button
                key={track.videoId}
                type="button"
                onClick={() => onPlayTrack(track, tracks)}
                className="group flex w-full min-w-0 items-center gap-3 border-b border-foreground/[0.06] px-3 py-3 text-left transition-colors last:border-0 hover:bg-foreground/[0.045] md:px-4"
              >
                <span className="w-6 shrink-0 text-center font-mono text-[10px] text-zinc-600">{String(index + 1).padStart(2, '0')}</span>
                <img
                  src={track.thumbnail || '/placeholder.svg'}
                  alt=""
                  loading="lazy"
                  className="h-12 w-12 shrink-0 rounded-xl border border-foreground/[0.08] object-cover grayscale-[.2]"
                />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-medium text-zinc-200">{track.title}</strong>
                  <small className="mt-1 block truncate text-xs text-zinc-600">{track.artist}</small>
                </span>
                <span className="mr-1 hidden text-[10px] text-zinc-600 sm:block">{track.duration}</span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-950 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
