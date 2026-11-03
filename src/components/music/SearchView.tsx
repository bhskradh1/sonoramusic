import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, Play, Plus, Loader2, Heart, MoreVertical, ListPlus, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { searchMelodiyaTracks } from '@/lib/musicSearch';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePreferences, GENRE_OPTIONS } from '@/contexts/PreferencesContext';
import { fetchPreferenceSuggestions, type RecTrack } from '@/lib/recommendations';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration: string;
  source?: 'youtube_music' | string;
}

interface SearchViewProps {
  onPlayTrack: (track: Track) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ onPlayTrack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [visibleSearchResultsCount, setVisibleSearchResultsCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
  const [playlists, setPlaylists] = useState<Array<{id: string, name: string}>>([]);
  const [suggestions, setSuggestions] = useState<RecTrack[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const searchInFlightRef = React.useRef(false);
  const lastSubmittedRef = React.useRef<{ query: string; at: number } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { preferences, version } = usePreferences();
  const visibleSearchResults = searchResults.slice(0, visibleSearchResultsCount);

  const runSearch = React.useCallback(async (query: string, notify = false) => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setVisibleSearchResultsCount(5);
      return;
    }

    // Coalesce rapid duplicate submissions (including double taps) for the same query.
    const normalizedQuery = q.toLowerCase().replace(/\s+/g, ' ');
    const last = lastSubmittedRef.current;
    if (searchInFlightRef.current) return;
    if (last?.query === normalizedQuery && Date.now() - last.at < 5000) return;
    lastSubmittedRef.current = { query: normalizedQuery, at: Date.now() };
    searchInFlightRef.current = true;
    setLoading(true);
    try {
      const tracks = await searchMelodiyaTracks(q);
      setSearchResults(tracks);
      setVisibleSearchResultsCount(5);

      if (notify && tracks.length === 0) {
        toast({
          title: "No results found",
          description: "Try searching with different keywords"
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      if (notify) {
        toast({
          title: "Search failed",
          description: "Unable to search for music. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      searchInFlightRef.current = false;
      setLoading(false);
    }
  }, [toast]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchQuery, true);
  };

  // Typing only edits the query. YouTube is called only on form submission.

  const handlePlayTrack = (track: Track) => {
    onPlayTrack(track);
    addToRecentlyPlayed(track);
  };

  const toggleLike = async (track: Track) => {
    if (!user) return;

    try {
      const isLiked = likedSongs.has(track.videoId);
      
      if (isLiked) {
        // Remove from liked songs
        const { error } = await supabase
          .from('liked_songs')
          .delete()
          .eq('user_id', user.id)
          .eq('youtube_video_id', track.videoId);

        if (error) throw error;

        setLikedSongs(prev => {
          const newSet = new Set(prev);
          newSet.delete(track.videoId);
          return newSet;
        });

        toast({
          title: "Removed from liked songs",
          description: `"${track.title}" removed from your liked songs`
        });
      } else {
        // Add to liked songs
        const { error } = await supabase
          .from('liked_songs')
          .insert({
            user_id: user.id,
            youtube_video_id: track.videoId,
            title: track.title,
            artist: track.artist,
            thumbnail_url: track.thumbnail
          });

        if (error) throw error;

        setLikedSongs(prev => new Set([...prev, track.videoId]));

        toast({
          title: "Added to liked songs",
          description: `"${track.title}" added to your liked songs`
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({
        title: "Error",
        description: "Failed to update liked songs",
        variant: "destructive"
      });
    }
  };

  const addToPlaylist = async (track: Track, playlistId: string) => {
    try {
      const { error } = await supabase
        .from('playlist_songs')
        .insert({
          playlist_id: playlistId,
          youtube_video_id: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail_url: track.thumbnail
        });

      if (error) throw error;

      toast({
        title: "Added to playlist",
        description: `"${track.title}" added to playlist`
      });
    } catch (error) {
      console.error('Error adding to playlist:', error);
      toast({
        title: "Error",
        description: "Failed to add song to playlist",
        variant: "destructive"
      });
    }
  };

  const addToRecentlyPlayed = async (track: Track) => {
    if (!user) return;
    
    try {
      await supabase
        .from('recently_played')
        .insert({
          user_id: user.id,
          youtube_video_id: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail_url: track.thumbnail
        });
    } catch (error) {
      console.error('Error adding to recently played:', error);
    }
  };

  const loadUserData = async () => {
    try {
      // Load liked songs
      const { data: likedData } = await supabase
        .from('liked_songs')
        .select('youtube_video_id')
        .eq('user_id', user?.id);

      if (likedData) {
        setLikedSongs(new Set(likedData.map(item => item.youtube_video_id)));
      }

      // Load playlists
      const { data: playlistData } = await supabase
        .from('playlists')
        .select('id, name')
        .eq('user_id', user?.id);

      if (playlistData) {
        setPlaylists(playlistData);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  // Load user's liked songs and playlists on mount
  React.useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  // Load personalized recommendations when the query box is empty.
  // Re-fetches whenever preferences change (version increments).
  useEffect(() => {
    if (!user) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSuggestionsLoading(true);
    // Recommendation cards may use results already cached on this device,
    // but opening Search must not spend YouTube API quota.
    fetchPreferenceSuggestions(preferences, false)
      .then((tracks) => {
        if (!cancelled) setSuggestions(tracks);
      })
      .catch((e) => console.error('Failed to load recommendations:', e))
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, preferences, version]);

  const renderTrackCard = (track: Track, showMenu: boolean) => {
    const liked = likedSongs.has(track.videoId);
    return (
      <div key={track.videoId || track.id} className="group min-w-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => handlePlayTrack(track)}
            aria-label={`Play ${track.title}`}
            className="relative block aspect-square w-full overflow-hidden rounded-2xl border border-foreground/[0.085] bg-card shadow-[inset_0_1px_rgba(255,255,255,.07),0_14px_35px_rgba(0,0,0,.24)] transition duration-300 group-hover:-translate-y-1 group-hover:border-foreground/20"
          >
            <img src={track.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover grayscale-[.35] contrast-[1.05] transition duration-500 group-hover:grayscale-0" />
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,transparent_10%,rgba(255,255,255,.11)_35%,transparent_48%)] mix-blend-screen" />
          </button>
          <span className="pointer-events-none absolute bottom-3 right-3 grid size-10 translate-y-2 place-items-center rounded-full bg-zinc-200 text-zinc-950 opacity-0 shadow-xl transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </span>
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              aria-label={liked ? 'Unlike' : 'Like'}
              onClick={() => toggleLike(track)}
              className={`grid size-8 place-items-center rounded-full bg-black/45 backdrop-blur-md transition-colors ${liked ? 'text-signal' : 'text-zinc-300 hover:text-zinc-100'}`}
            >
              <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} />
            </button>
            {showMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="More" className="grid size-8 place-items-center rounded-full bg-black/45 text-zinc-300 backdrop-blur-md transition-colors hover:text-zinc-100">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {playlists.map((playlist) => (
                    <DropdownMenuItem key={playlist.id} onClick={() => addToPlaylist(track, playlist.id)}>
                      <ListPlus className="w-4 h-4 mr-2" />
                      Add to {playlist.name}
                    </DropdownMenuItem>
                  ))}
                  {playlists.length === 0 && <DropdownMenuItem disabled>No playlists found</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <button type="button" onClick={() => handlePlayTrack(track)} className="mt-3 block w-full min-w-0 text-left">
          <strong className="block truncate text-sm font-medium text-zinc-200">{track.title}</strong>
          <small className="mt-1 block truncate text-xs text-zinc-600">{track.artist}</small>
        </button>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[92rem] p-4 pb-32 md:px-10 md:py-8 space-y-6">
      {/* Search Header */}
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">Explore Sonora</p>
          <h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Find your next frequency</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Search the catalog or move through music by mood and genre.</p>
        </div>

        <form onSubmit={handleSearch} className="search-spotlight !min-h-[3.6rem] !p-2 max-w-3xl">
          <span className="search-lens !size-11"><Search className="w-[18px] h-[18px]" /></span>
          <input
            type="text"
            aria-label="Search music"
            placeholder="Artist, track, album or mood…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !searchQuery.trim()}
            className="mr-1 rounded-full border border-foreground/[0.09] px-3 py-1.5 text-[10px] tracking-[.12em] text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'FIND'}
          </button>
        </form>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6">
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setSearchResults([]); setVisibleSearchResultsCount(5); }}
            className={`shrink-0 rounded-full border px-4 py-2 text-xs transition-colors ${
              !searchQuery.trim()
                ? 'border-zinc-300 bg-zinc-200 text-zinc-950'
                : 'border-foreground/10 bg-foreground/[0.025] text-muted-foreground hover:text-zinc-200'
            }`}
          >
            All
          </button>
          {GENRE_OPTIONS.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => { setSearchQuery(genre); runSearch(genre, true); }}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs transition-colors ${
                searchQuery.trim().toLowerCase() === genre.toLowerCase()
                  ? 'border-zinc-300 bg-zinc-200 text-zinc-950'
                  : 'border-foreground/10 bg-foreground/[0.025] text-muted-foreground hover:text-zinc-200'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-medium text-zinc-200">Search results</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Showing {visibleSearchResults.length} of {searchResults.length} songs
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
            {visibleSearchResults.map((track) => renderTrackCard(track, true))}
          </div>
          {visibleSearchResults.length < searchResults.length && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                className="btn-ghost-pill border-foreground/[0.12]"
                onClick={() => setVisibleSearchResultsCount((current) =>
                  Math.min(current + 5, searchResults.length)
                )}
              >
                Show {Math.min(5, searchResults.length - visibleSearchResults.length)} more songs
              </Button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 md:py-12">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm md:text-base">Searching for music...</span>
          </div>
        </div>
      )}

      {!loading && searchResults.length === 0 && searchQuery && (
        <div className="flex flex-col items-center justify-center py-8 md:py-12 space-y-4">
          <Search className="w-12 h-12 md:w-16 md:h-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-base md:text-lg font-medium">No results found</h3>
            <p className="text-sm md:text-base text-muted-foreground">Try searching with different keywords</p>
          </div>
        </div>
      )}

      {!loading && !searchQuery && (
        <div className="space-y-6">
          {/* Recommended for you */}
          {user && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-signal" />
                <h2 className="text-xl font-medium text-zinc-200">Recommended for you</h2>
              </div>

              {suggestionsLoading ? (
                <div className="flex items-center gap-3 py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-muted-foreground text-sm">Curating your picks...</span>
                </div>
              ) : suggestions.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
                  {suggestions.map((track) => renderTrackCard(track as unknown as Track, false))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pick your favourite genres in Settings to get personalized picks.
                </p>
              )}
            </div>
          )}

          {!user && (
            <div className="flex flex-col items-center justify-center py-8 md:py-12 space-y-4">
              <Search className="w-12 h-12 md:w-16 md:h-16 text-muted-foreground" />
              <div className="text-center">
                <h3 className="text-base md:text-lg font-medium">Search for music</h3>
                <p className="text-sm md:text-base text-muted-foreground">Find songs, artists, and albums</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};