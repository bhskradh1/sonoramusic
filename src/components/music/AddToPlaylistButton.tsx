import React, { useEffect, useState } from 'react';
import { Check, ListMusic, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface TrackToSave {
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

interface PlaylistOption {
  id: string;
  name: string;
  song_count: number;
}

interface AddToPlaylistButtonProps {
  track: TrackToSave;
  compact?: boolean;
}

export const AddToPlaylistButton: React.FC<AddToPlaylistButtonProps> = ({ track, compact = true }) => {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const savedPlaylists = playlists.filter((playlist) => savedIds.includes(playlist.id));
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setPlaylists([]);
      setSavedIds([]);
      setMembershipLoading(false);
      setLoading(false);
      if (open) {
        toast({ title: 'Sign in to save songs', description: 'Your playlists are linked to your account.' });
        setOpen(false);
      }
      return;
    }

    const loadPlaylists = async () => {
      // The compact + control also needs membership state before the dialog opens.
      setPlaylists([]);
      setSavedIds([]);
      setMembershipLoading(true);
      if (open) setLoading(true);

      const { data, error } = await supabase
        .from('playlists')
        .select('id, name, playlist_songs(count)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        if (open) {
          toast({ title: 'Could not load playlists', description: error.message, variant: 'destructive' });
        } else {
          console.error('Could not load playlists for membership check:', error);
        }
        setPlaylists([]);
        setSavedIds([]);
        setLoading(false);
        setMembershipLoading(false);
        return;
      }

      const loadedPlaylists = (data || []).map((playlist: any) => ({
        id: playlist.id,
        name: playlist.name,
        song_count: playlist.playlist_songs?.[0]?.count || 0,
      }));
      setPlaylists(loadedPlaylists);

      if (loadedPlaylists.length === 0) {
        setSavedIds([]);
        setLoading(false);
        setMembershipLoading(false);
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('playlist_songs')
        .select('playlist_id')
        .eq('youtube_video_id', track.videoId)
        .in('playlist_id', loadedPlaylists.map((playlist) => playlist.id));

      if (cancelled) return;
      if (membershipError) {
        console.error('Could not check playlist membership:', membershipError);
        setSavedIds([]);
      } else {
        setSavedIds([...new Set((memberships || []).map((item: any) => item.playlist_id))]);
      }
      setLoading(false);
      setMembershipLoading(false);
    };

    void loadPlaylists();
    return () => { cancelled = true; };
  }, [open, user, track.videoId, toast]);
  const addToPlaylist = async (playlist: PlaylistOption) => {
    if (!user || savingId) return;
    setSavingId(playlist.id);
    try {
      const { data: existing, error: lookupError } = await supabase
        .from('playlist_songs')
        .select('id')
        .eq('playlist_id', playlist.id)
        .eq('youtube_video_id', track.videoId)
        .limit(1)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (existing) {
        setSavedIds(prev => [...prev, playlist.id]);
        toast({ title: 'Already in playlist', description: `“${track.title}” is already in ${playlist.name}.` });
        return;
      }

      const { error } = await supabase.from('playlist_songs').insert({
        playlist_id: playlist.id,
        youtube_video_id: track.videoId,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        thumbnail_url: track.thumbnail,
      });
      if (error) throw error;

      setSavedIds(prev => [...prev, playlist.id]);
      setPlaylists(prev => prev.map(item => item.id === playlist.id
        ? { ...item, song_count: item.song_count + 1 }
        : item));
      toast({ title: 'Added to playlist', description: `“${track.title}” added to ${playlist.name}.` });
    } catch (error) {
      console.error('Unable to add song to playlist:', error);
      toast({
        title: 'Could not add song',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={savedPlaylists.length
            ? `Song saved in ${savedPlaylists.length} playlist${savedPlaylists.length === 1 ? '' : 's'}: ${savedPlaylists.map((item) => item.name).join(', ')}. Manage playlists.`
            : 'Add song to playlist'}
          title={savedPlaylists.length
            ? `Saved in: ${savedPlaylists.map((item) => item.name).join(', ')}`
            : 'Add to playlist'}
          className={compact
            ? `relative h-10 w-10 rounded-full border p-0 transition-colors ${savedPlaylists.length ? 'border-zinc-300/25 bg-zinc-100/10 text-zinc-100 hover:bg-zinc-100/15' : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/10 hover:text-zinc-100'}`
            : 'h-10 gap-2 rounded-full border border-foreground/15 bg-foreground/[0.06] px-4 hover:bg-foreground/10'}
        >
          {membershipLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : savedPlaylists.length > 0
              ? <Check className="h-4 w-4" />
              : <Plus className="h-4 w-4" />}
          {!compact && (
            <span className="text-sm">
              {savedPlaylists.length ? `In ${savedPlaylists.length} playlist${savedPlaylists.length === 1 ? '' : 's'}` : 'Add to playlist'}
            </span>
          )}
          {compact && savedPlaylists.length > 0 && (
            <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full border border-[#070808] bg-zinc-100 px-1 text-[9px] font-semibold leading-4 text-zinc-950">
              {savedPlaylists.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-panel max-h-[85dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-foreground/80" />
            Add to playlist
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.04] p-3">
          <img src={track.thumbnail || '/placeholder.svg'} alt="" className="h-12 w-12 rounded-lg object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{track.title}</p>
            <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
          </div>
        </div>
        {savedPlaylists.length > 0 && (
          <div className="rounded-xl border border-zinc-300/15 bg-zinc-100/[0.045] p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Check className="h-4 w-4 shrink-0" />
              Already in {savedPlaylists.length} playlist{savedPlaylists.length === 1 ? '' : 's'}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {savedPlaylists.map((playlist) => (
                <span key={playlist.id} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-zinc-300">
                  {playlist.name}
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-500">
          {savedPlaylists.length ? 'Add to another playlist' : 'Choose a playlist'}
        </p>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading playlists…
            </div>
          ) : playlists.length === 0 ? (
            <div className="py-8 text-center">
              <ListMusic className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No playlists yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Create a playlist first, then add this song.</p>
            </div>
          ) : playlists.map(playlist => (
            <button
              key={playlist.id}
              type="button"
              disabled={savingId !== null || savedIds.includes(playlist.id)}
              onClick={() => addToPlaylist(playlist)}
              className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-foreground/10 hover:bg-foreground/[0.06] disabled:cursor-default disabled:opacity-70"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.08] text-foreground/80">
                <ListMusic className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{playlist.name}</span>
                <span className="block text-xs text-muted-foreground">{playlist.song_count} songs</span>
              </span>
              {savingId === playlist.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : savedIds.includes(playlist.id)
                  ? <Check className="h-4 w-4 text-zinc-100" />
                  : <Plus className="h-4 w-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
