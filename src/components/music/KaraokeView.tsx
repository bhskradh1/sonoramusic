import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mic2, Play, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface KaraokeViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
}

const KARAOKE_SEARCHES = [
  { name: 'Pop Hits', emoji: '🎤', query: 'karaoke pop hits 2025' },
  { name: 'Bollywood', emoji: '🎬', query: 'karaoke bollywood songs' },
  { name: 'Rock Classics', emoji: '🎸', query: 'karaoke rock classics' },
  { name: 'R&B / Soul', emoji: '🎶', query: 'karaoke r&b soul songs' },
  { name: 'EDM / Dance', emoji: '🎹', query: 'karaoke edm dance' },
  { name: 'Country', emoji: '🤠', query: 'karaoke country songs' },
  { name: 'K-Pop', emoji: '💜', query: 'karaoke kpop songs' },
  { name: 'Lo-Fi Chill', emoji: '🌙', query: 'karaoke lofi chill songs' },
] as const;

export const KaraokeView: React.FC<KaraokeViewProps> = ({ onPlayTrack }) => {
  const [query, setQuery] = useState('');
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const [heading, setHeading] = useState('');

  const runSearch = useCallback(async (q: string, label: string, autoplay: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', { body: { query: q } });
      if (error) throw error;
      const tracks = (data?.tracks || []) as Track[];
      setResults(tracks);
      setHeading(label);
      if (autoplay && tracks.length > 0) onPlayTrack(tracks[0], tracks);
    } catch (err) {
      console.error('Karaoke search error:', err);
      setResults([]);
      setHeading(label);
    }
  }, [onPlayTrack]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    await runSearch(`karaoke ${q}`, `Results for "${q}"`, false);
    setSearching(false);
  };

  const handleCategory = async (cat: typeof KARAOKE_SEARCHES[number]) => {
    setLoadingCategory(cat.name);
    await runSearch(cat.query, `${cat.name} karaoke`, true);
    setLoadingCategory(null);
  };

  return (
    <div className="relative min-h-full overflow-x-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-5xl space-y-8 p-5 pb-32 md:p-8">
        <header className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary shadow-[0_10px_28px_-12px_hsl(var(--primary))]">
            <Mic2 className="h-5 w-5 text-primary-foreground" />
          </span>
          <div>
            <h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Karaoke</h1>
            <p className="text-sm text-muted-foreground">Sing along with synced lyrics</p>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search any karaoke song…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 rounded-full border-foreground/[0.08] bg-foreground/[0.04] pl-10 backdrop-blur-xl focus-visible:ring-primary/40"
            />
          </div>
          <Button
            type="submit"
            disabled={searching || !query.trim()}
            className="h-11 shrink-0 rounded-full bg-gradient-primary px-6 font-semibold text-primary-foreground"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </form>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {KARAOKE_SEARCHES.map((k) => (
            <button
              key={k.name}
              onClick={() => handleCategory(k)}
              disabled={loadingCategory === k.name}
              className="group relative flex h-24 flex-col justify-between overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.04] p-3.5 text-left backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-foreground/[0.08] disabled:opacity-70 md:h-28"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/25 blur-2xl transition-transform duration-500 group-hover:scale-150" />
              <span className="relative z-10 text-2xl">
                {loadingCategory === k.name ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : k.emoji}
              </span>
              <span className="relative z-10 text-sm font-semibold">{k.name}</span>
            </button>
          ))}
        </section>

        {results.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">{heading}</h2>
            <div className="space-y-2">
              {results.map((track) => (
                <button
                  key={track.id}
                  onClick={() => onPlayTrack(track, results)}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03] p-2.5 text-left transition-colors hover:bg-foreground/[0.07]"
                >
                  <img src={track.thumbnail} alt={track.title} loading="lazy" className="h-12 w-12 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{track.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
