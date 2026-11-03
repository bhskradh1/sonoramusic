import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Music, TrendingUp, Clock, Heart, ChevronRight, ChevronLeft, Moon, Headphones, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchWeeklyTrending } from '@/lib/trending';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePreferences } from '@/contexts/PreferencesContext';
import { fetchPersonalizedRows, type RecommendationRow } from '@/lib/recommendations';
import { fetchPopularArtists, type MusicArtist } from '@/lib/musicSearch';
import type { MusicMood } from './MusicDiscoveryDetailView';
import { LANGUAGE_LABELS } from '@/contexts/PreferencesContext';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface HomeViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
  onViewChange?: (view: string) => void;
  onSelectArtist: (artist: MusicArtist) => void;
  onSelectMood: (mood: MusicMood) => void;
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};


/* ─────────── sub-components ─────────── */

const TrackCard: React.FC<{ track: Track; onPlay: (t: Track) => void; index: number }> = ({ track, onPlay, index }) => (
  <button
    onClick={() => onPlay(track)}
    className="group w-[150px] sm:w-[168px] shrink-0 snap-start text-left"
    style={{ animationDelay: `${index * 50}ms` }}
  >
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-foreground/[0.085] bg-card shadow-[inset_0_1px_rgba(255,255,255,.07),0_14px_35px_rgba(0,0,0,.24)] transition duration-300 group-hover:-translate-y-1 group-hover:border-foreground/20">
      <img
        src={track.thumbnail}
        alt={track.title}
        loading="lazy"
        className="h-full w-full object-cover grayscale-[.35] contrast-[1.05] transition duration-500 group-hover:grayscale-0"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,transparent_10%,rgba(255,255,255,.11)_35%,transparent_48%)] mix-blend-screen" />
      <div className="absolute bottom-3 right-3 grid h-10 w-10 translate-y-2 place-items-center rounded-full bg-zinc-200 text-zinc-950 opacity-0 shadow-xl transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <Play className="ml-0.5 h-4 w-4 fill-current" />
      </div>
    </div>
    <div className="mt-3 min-w-0 px-0.5">
      <p className="truncate text-sm font-medium text-zinc-200">{track.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{track.artist}</p>
    </div>
  </button>
);

/** Compact two-up shortcut tile: square art on the left, title on the right. */
const QuickTile: React.FC<{ title: string; art: React.ReactNode; onClick: () => void }> = ({ title, art, onClick }) => (
  <button
    onClick={onClick}
    className="group flex min-w-0 items-center overflow-hidden rounded-xl border border-foreground/[0.08] bg-foreground/[0.055] text-left transition-colors hover:bg-foreground/[0.09]"
  >
    <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden md:h-16 md:w-16">{art}</span>
    <strong className="min-w-0 flex-1 truncate px-3 text-xs font-semibold text-zinc-200 md:text-sm">{title}</strong>
    <span className="mr-3 hidden h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-950 shadow-lg group-hover:grid">
      <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
    </span>
  </button>
);

const Row: React.FC<{
  title: string;
  subtitle?: string;
  onViewAll?: () => void;
  showArrows?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, onViewAll, showArrows, children }) => {
  const railRef = React.useRef<HTMLDivElement>(null);
  const scrollRail = (dir: 1 | -1) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {subtitle && <p className="text-[10px] uppercase tracking-[.2em] text-muted-foreground/70">{subtitle}</p>}
          <h2 className="mt-1 text-xl font-medium text-zinc-200">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showArrows && (
            <div className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="sm" aria-label="Scroll left" className="h-8 w-8 rounded-full p-0 text-muted-foreground" onClick={() => scrollRail(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Scroll right" className="h-8 w-8 rounded-full p-0 text-muted-foreground" onClick={() => scrollRail(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          {onViewAll && (
            <button onClick={onViewAll} className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-zinc-200">
              Show all <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div
        ref={railRef}
        className="no-scrollbar -mx-5 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:-mx-10 md:px-10"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>
    </section>
  );
};

const Chip: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }> = ({
  icon,
  label,
  onClick,
  active,
}) => (
  <button
    onClick={onClick}
    className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs transition-colors ${
      active
        ? 'border-zinc-300 bg-zinc-200 text-zinc-950'
        : 'border-foreground/10 bg-foreground/[0.025] text-muted-foreground hover:text-zinc-200'
    }`}
  >
    {icon}
    {label}
  </button>
);

const MoodTile: React.FC<{
  title: string;
  subtitle: string;
  variant: 'night' | 'focus';
  loading?: boolean;
  onClick: () => void;
}> = ({ title, subtitle, variant, loading, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className={`group relative min-h-[7.5rem] overflow-hidden rounded-2xl border border-foreground/[0.09] p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:border-foreground/20 disabled:opacity-70 ${
      variant === 'night'
        ? 'bg-[linear-gradient(135deg,#222725,#111414_58%,#090a0a)]'
        : 'bg-[linear-gradient(135deg,#4b514d,#252927_55%,#101212)]'
    }`}
  >
    <span aria-hidden className="pointer-events-none absolute -right-5 -top-7 size-28 rounded-full border border-white/10" />
    <span aria-hidden className="pointer-events-none absolute -right-1 top-4 size-16 rounded-full border border-white/10" />
    <span aria-hidden className={`pointer-events-none absolute right-5 top-0 h-full w-px ${variant === 'night' ? 'bg-white/15' : 'bg-white/10'}`} />
    <span className="relative z-10 flex h-full flex-col justify-end">
      <span className="mb-2 flex items-center gap-2 text-zinc-100">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : variant === 'night' ? <Moon className="h-4 w-4 text-zinc-300" /> : <Headphones className="h-4 w-4 text-zinc-300" />}
        <strong className="text-sm font-semibold">{title}</strong>
      </span>
      <span className="text-[11px] text-zinc-400">{subtitle}</span>
    </span>
  </button>
);

const ArtistCard: React.FC<{
  artist: MusicArtist;
  index: number;
  onClick: () => void;
}> = ({ artist, index, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group min-w-0 text-center"
    aria-label={`Show official songs by ${artist.name}`}
    style={{ animationDelay: `${index * 45}ms` }}
  >
    <span className="relative mx-auto block aspect-square w-full max-w-[8.5rem] overflow-hidden rounded-full border border-foreground/[0.1] bg-[radial-gradient(circle_at_35%_30%,#777d78,#303532_42%,#111313_76%)] shadow-[inset_0_1px_rgba(255,255,255,.14),0_12px_30px_rgba(0,0,0,.3)] transition duration-300 group-hover:-translate-y-1 group-hover:border-foreground/25">
      {artist.thumbnail ? (
        <img
          src={artist.thumbnail}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover grayscale-[.55] contrast-[1.08] transition duration-500 group-hover:grayscale-0"
        />
      ) : (
        <span aria-hidden className="absolute inset-0 bg-[repeating-radial-gradient(circle_at_50%_50%,transparent_0_12px,rgba(255,255,255,.09)_13px,transparent_15px)]" />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-white/10 bg-[linear-gradient(125deg,transparent_15%,rgba(255,255,255,.14)_42%,transparent_54%)]" />
      <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-zinc-100 text-zinc-950 opacity-0 shadow-lg transition group-hover:opacity-100">
        <Play className="ml-0.5 h-3 w-3 fill-current" />
      </span>
    </span>
    <strong className="mt-2 block truncate text-xs font-semibold text-zinc-300 transition-colors group-hover:text-zinc-100">{artist.name}</strong>
    <small className="mt-1 block text-[10px] text-zinc-600">{artist.genre || 'Artist'}</small>
  </button>
);

const SkeletonCard = () => (
  <div className="w-[150px] shrink-0 sm:w-[168px]">
    <div className="aspect-square w-full animate-pulse rounded-2xl bg-foreground/[0.05]" />
    <div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-foreground/[0.05]" />
    <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded bg-foreground/[0.04]" />
  </div>
);

/* ─────────── main component ─────────── */

export const HomeView: React.FC<HomeViewProps> = ({ onPlayTrack, onViewChange, onSelectArtist, onSelectMood }) => {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [personalRows, setPersonalRows] = useState<RecommendationRow[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [popularArtists, setPopularArtists] = useState<MusicArtist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [featIndex, setFeatIndex] = useState(0);
  const touchStartX = React.useRef<number | null>(null);
  const { user } = useAuth();
  const { preferences, version, loading: preferencesLoading } = usePreferences();
  const greeting = useMemo(getGreeting, []);

  const topFive = trendingTracks.slice(0, 5);
  const featured = topFive[featIndex] ?? topFive[0] ?? null;
  const restTrending = trendingTracks.slice(5);

  const moveFeatured = useCallback(
    (dir: 1 | -1) => {
      setFeatIndex((i) => {
        const len = Math.max(topFive.length, 1);
        return (i + dir + len) % len;
      });
    },
    [topFive.length]
  );

  useEffect(() => {
    if (preferencesLoading) return;
    let cancelled = false;
    setPersonalLoading(true);
    // Home recommendations are cache-only; opening Home must not issue searches.
    fetchPersonalizedRows(preferences, false, false)
      .then((rows) => {
        if (!cancelled) setPersonalRows(rows);
      })
      .catch((e) => console.error('Personalized rows failed:', e))
      .finally(() => {
        if (!cancelled) setPersonalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preferences, version, preferencesLoading]);


  useEffect(() => {
    if (user) fetchRecentlyPlayed();
    fetchTrending();
  }, [user]);

  // Popular artists follow the listener's saved genres and language.
  useEffect(() => {
    if (preferencesLoading) return;
    let cancelled = false;
    setArtistsLoading(true);
    const genres = preferences.favorite_genres?.length
      ? preferences.favorite_genres.slice(0, 3)
      : ['Pop'];
    const language = LANGUAGE_LABELS[preferences.preferred_language] || 'English';

    fetchPopularArtists(genres, language, 6)
      .then((artists) => {
        if (!cancelled) setPopularArtists(artists);
      })
      .catch((error) => {
        console.error('Failed to load popular artists:', error);
        if (!cancelled) setPopularArtists([]);
      })
      .finally(() => {
        if (!cancelled) setArtistsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [preferences, version, preferencesLoading]);

  const fetchRecentlyPlayed = async () => {
    try {
      const { data, error } = await supabase
        .from('recently_played')
        .select('*')
        .eq('user_id', user?.id)
        .order('played_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setRecentlyPlayed(
        (data ?? []).map(item => ({
          id: item.id,
          title: item.title,
          artist: item.artist || 'Unknown Artist',
          thumbnail: item.thumbnail_url || '/placeholder.svg',
          videoId: item.youtube_video_id,
        }))
      );
    } catch (error) {
      console.error('Error fetching recently played:', error);
    }
  };

  const fetchTrending = async () => {
    setTrendingLoading(true);
    try {
      const tracks = await fetchWeeklyTrending();
      setTrendingTracks(tracks.slice(0, 20) as Track[]);
    } catch (err) {
      console.error('Error fetching trending:', err);
      setTrendingTracks([]);
    } finally {
      setTrendingLoading(false);
    }
  };


  const quickTracks = useMemo(() => {
    const seen = new Set<string>();
    return [...recentlyPlayed, ...trendingTracks]
      .filter((t) => (seen.has(t.videoId) ? false : (seen.add(t.videoId), true)))
      .slice(0, 5);
  }, [recentlyPlayed, trendingTracks]);

  return (
    <div className="relative min-h-full overflow-x-hidden">
      <div className="relative z-10 mx-auto max-w-[92rem] space-y-11 px-5 pb-32 pt-5 md:px-10 md:pt-8">
        {/* ── Greeting ── */}
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">{greeting}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-.045em] text-zinc-100 md:text-4xl">What do you want to hear?</h1>
        </header>

        {/* ── Quick shortcuts ── */}
        <section className="-mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          <QuickTile
            title="Liked Songs"
            onClick={() => onViewChange?.('liked')}
            art={
              <span className="grid h-full w-full place-items-center bg-gradient-to-br from-zinc-300 to-zinc-700 text-zinc-950">
                <Heart className="h-5 w-5 fill-current" />
              </span>
            }
          />
          {quickTracks.map((t) => (
            <QuickTile
              key={t.videoId}
              title={t.title}
              onClick={() => onPlayTrack(t, quickTracks)}
              art={<img src={t.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover grayscale-[.35]" />}
            />
          ))}
        </section>

        {/* ── Featured card (top 5 of the week) ── */}
        <section
          className="relative min-h-[21rem] overflow-hidden rounded-[1.4rem] border border-foreground/[0.09] bg-gradient-hero shadow-2xl shadow-black/30"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 45) moveFeatured(dx < 0 ? 1 : -1);
            touchStartX.current = null;
          }}
        >
          <div className="relative z-10 max-w-xl px-7 py-11 md:px-12 md:py-12">
            <div className="mb-4 flex items-center gap-2 text-[9px] tracking-[.22em] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_12px_hsl(var(--signal)/.6)]" />
              FEATURED MIX
              {topFive.length > 1 && <span className="ml-1 text-zinc-600">{featIndex + 1}/{topFive.length}</span>}
            </div>
            <h2 className="line-clamp-2 text-4xl font-medium leading-[.98] tracking-[-.055em] text-zinc-100 md:text-6xl">
              {featured ? featured.title : 'Loading picks…'}
            </h2>
            <p className="mt-1 truncate bg-gradient-to-r from-zinc-100 to-zinc-500 bg-clip-text text-3xl font-medium tracking-[-.05em] text-transparent md:text-5xl">
              {featured ? featured.artist : 'Fresh tracks on the way'}
            </p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-zinc-400">
              The week's most-played records, queued from the top of the chart.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={!featured}
                onClick={() => featured && onPlayTrack(featured, trendingTracks)}
                className="btn-silver px-5 py-3 text-xs disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" /> Play mix
              </button>
              <button onClick={() => onViewChange?.('trending')} className="btn-ghost-pill px-5 py-3 text-xs">
                Explore trending
              </button>
            </div>
            {topFive.length > 1 && (
              <div className="mt-6 flex items-center gap-2">
                {topFive.map((t, i) => (
                  <button
                    key={t.id}
                    aria-label={`Show featured track ${i + 1}`}
                    onClick={() => setFeatIndex(i)}
                    className={`h-1 rounded-full transition-all ${i === featIndex ? 'w-6 bg-zinc-200' : 'w-1.5 bg-foreground/25 hover:bg-foreground/40'}`}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="vinyl-art" aria-hidden>
            <span />
            <i>{featured && <img src={featured.thumbnail} alt="" />}</i>
          </div>
          {topFive.length > 1 && (
            <>
              <button aria-label="Previous featured track" onClick={() => moveFeatured(-1)} className="absolute bottom-5 right-16 z-20 hidden h-9 w-9 place-items-center rounded-full border border-foreground/10 bg-black/30 text-zinc-400 transition-colors hover:text-zinc-100 md:grid">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button aria-label="Next featured track" onClick={() => moveFeatured(1)} className="absolute bottom-5 right-5 z-20 hidden h-9 w-9 place-items-center rounded-full border border-foreground/10 bg-black/30 text-zinc-400 transition-colors hover:text-zinc-100 md:grid">
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </section>

        {/* ── Quick chips ── */}
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-10 md:px-10">
          <Chip icon={<Music className="h-3.5 w-3.5" />} label="Your Library" onClick={() => onViewChange?.('library')} active />
          <Chip icon={<TrendingUp className="h-3.5 w-3.5" />} label="Trending" onClick={() => onViewChange?.('trending')} />
          <Chip icon={<Heart className="h-3.5 w-3.5" />} label="Liked Songs" onClick={() => onViewChange?.('liked')} />
          <Chip icon={<Clock className="h-3.5 w-3.5" />} label="Recently Played" onClick={() => onViewChange?.('recently-played')} />
        </div>

        {/* ── Jump back in ── */}
        {recentlyPlayed.length > 0 && (
          <Row title="Recently played" subtitle="Jump back in" onViewAll={() => onViewChange?.('recently-played')}>
            {recentlyPlayed.map((track, i) => (
              <TrackCard key={track.id} track={track} onPlay={onPlayTrack} index={i} />
            ))}
          </Row>
        )}

        {/* ── Mood discovery ── */}
        <section className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground/70">Set the atmosphere</p>
            <h2 className="mt-1 text-xl font-medium text-zinc-200">Browse by mood</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <MoodTile
              title="Late night"
              subtitle="After-hours R&B and mellow electronics"
              variant="night"
              onClick={() => onSelectMood({
                id: 'late-night',
                title: 'Late night',
                subtitle: 'After-hours R&B and mellow electronics',
                description: 'After-hours R&B and mellow electronics',
                query: 'late night R&B chill electronic songs',
              })}
            />
            <MoodTile
              title="Deep focus"
              subtitle="Minimal, calm sounds for concentration"
              variant="focus"
              onClick={() => onSelectMood({
                id: 'deep-focus',
                title: 'Deep focus',
                subtitle: 'Minimal, calm sounds for concentration',
                description: 'Minimal, calm sounds for concentration',
                query: 'deep focus ambient electronic calm songs',
              })}
            />
          </div>
        </section>

        {/* ── Popular artists ── */}
        <section className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground/70">Picked for your taste</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <h2 className="text-xl font-medium text-zinc-200">Popular artists</h2>
              <span className="text-[10px] text-zinc-600">
                {preferences.favorite_genres.length ? preferences.favorite_genres.slice(0, 2).join(' · ') : 'Based on popular music'}
              </span>
            </div>
          </div>
          {artistsLoading ? (
            <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="mx-auto aspect-square w-full max-w-[8.5rem] animate-pulse rounded-full bg-foreground/[0.06]" />
                  <div className="mx-auto h-3 w-3/4 animate-pulse rounded bg-foreground/[0.05]" />
                </div>
              ))}
            </div>
          ) : popularArtists.length > 0 ? (
            <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
              {popularArtists.map((artist, index) => (
                <ArtistCard key={artist.browseId} artist={artist} index={index} onClick={() => onSelectArtist(artist)} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] px-5 py-8 text-center">
              <Sparkles className="mx-auto mb-3 h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Choose your favourite genres in Settings to discover artists that match your taste.</p>
            </div>
          )}
        </section>

        {/* ── Popular this week ── */}
        <Row title="Popular this week" subtitle="What everyone is streaming" showArrows onViewAll={() => onViewChange?.('trending')}>
          {trendingLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : restTrending.length > 0
            ? restTrending.map((track, i) => <TrackCard key={track.id} track={track} onPlay={onPlayTrack} index={i} />)
            : <p className="py-8 text-sm text-muted-foreground">Could not load trending songs</p>}
        </Row>

        {/* ── Personalized rows ── */}
        {personalLoading && personalRows.length === 0 ? (
          <Row title="Made for you" subtitle="Tuning to your taste…" showArrows>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </Row>
        ) : (
          personalRows.map((row) => (
            <Row key={row.key} title={row.title} subtitle={row.subtitle} showArrows onViewAll={() => onViewChange?.('settings')}>
              {row.tracks.map((track, i) => (
                <TrackCard key={`${row.key}-${track.id}`} track={track as Track} onPlay={(t) => onPlayTrack(t, row.tracks as Track[])} index={i} />
              ))}
            </Row>
          ))
        )}

      </div>
    </div>
  );
};
