import React, { useEffect, useState } from 'react';
import { Heart, ListMusic, Share2, Clock, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

interface LibraryViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
  onViewChange: (view: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onPlayTrack, onViewChange }) => {
  const { user } = useAuth();
  const [counts, setCounts] = useState<{ liked: number | null; playlists: number | null; recent: number | null }>({
    liked: null,
    playlists: null,
    recent: null,
  });
  const [recent, setRecent] = useState<Track[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const count = async (table: 'liked_songs' | 'playlists' | 'recently_played') => {
      const { count: n } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      return n ?? 0;
    };

    Promise.all([count('liked_songs'), count('playlists'), count('recently_played')])
      .then(([liked, playlists, recentCount]) => {
        if (!cancelled) setCounts({ liked, playlists, recent: recentCount });
      })
      .catch((e) => console.error('Library counts failed:', e));

    supabase
      .from('recently_played')
      .select('*')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (cancelled) return;
        setRecent(
          (data ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            artist: item.artist || 'Unknown Artist',
            thumbnail: item.thumbnail_url || '/placeholder.svg',
            videoId: item.youtube_video_id,
          }))
        );
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const plural = (n: number | null, one: string, many: string) => (n === null ? '…' : `${n} ${n === 1 ? one : many}`);

  const tiles = [
    { view: 'liked', label: 'Liked Songs', meta: plural(counts.liked, 'track', 'tracks'), Icon: Heart },
    { view: 'playlists', label: 'Playlists', meta: plural(counts.playlists, 'collection', 'collections'), Icon: ListMusic },
    { view: 'shared-playlists', label: 'Shared with Me', meta: 'From your circle', Icon: Share2 },
    { view: 'recently-played', label: 'History', meta: plural(counts.recent, 'recent play', 'recent plays'), Icon: Clock },
  ];

  return (
    <div className="mx-auto max-w-[92rem] px-5 pb-32 pt-5 md:px-10 md:pt-8">
      <div className="mb-7">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">Your collection</p>
        <h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Library</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Everything you have saved, organized around the way you listen.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {tiles.map(({ view, label, meta, Icon }) => (
          <button
            key={view}
            type="button"
            onClick={() => onViewChange(view)}
            className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] p-5 text-left transition-colors hover:bg-foreground/[0.05]"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-foreground/5 text-zinc-300">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </span>
            <strong className="mt-6 block text-sm text-zinc-200">{label}</strong>
            <small className="mt-1 block text-xs text-zinc-600">{meta}</small>
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <section className="mt-10">
          <p className="text-[10px] uppercase tracking-[.2em] text-muted-foreground/70">Jump back in</p>
          <h2 className="mb-5 mt-1 text-xl font-medium text-zinc-200">Recently played</h2>
          <div className="overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]">
            {recent.map((track, index) => (
              <button
                key={track.id}
                type="button"
                onClick={() => onPlayTrack(track, recent)}
                className="group grid w-full grid-cols-[1.75rem_3rem_minmax(0,1fr)_2rem] items-center gap-3 border-b border-foreground/[0.06] px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-foreground/[0.04] md:px-4"
              >
                <span className="text-[10px] text-zinc-600">{String(index + 1).padStart(2, '0')}</span>
                <img src={track.thumbnail} alt="" loading="lazy" className="size-11 rounded-lg border border-foreground/[0.09] object-cover grayscale-[.3]" />
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-medium text-zinc-200">{track.title}</strong>
                  <small className="mt-0.5 block truncate text-xs text-muted-foreground">{track.artist}</small>
                </span>
                <Play className="h-4 w-4 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
