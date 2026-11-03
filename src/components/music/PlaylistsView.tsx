import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Music, Plus, Play, Trash2, Sparkles, ListMusic } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { SharePlaylistDialog } from './SharePlaylistDialog';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface Playlist {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  cover_image_url: string;
  created_at: string;
  song_count?: number;
}

interface PlaylistsViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
  onViewPlaylist: (playlistId: string) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({ onPlayTrack, onViewPlaylist }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState({
    name: '',
    description: '',
    isPublic: false
  });
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchPlaylists();
    }
  }, [user]);

  const fetchPlaylists = async () => {
    try {
      const { data: playlistData, error } = await supabase
        .from('playlists')
        .select(`
          *,
          playlist_songs(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const playlistsWithCount = playlistData?.map(playlist => ({
        ...playlist,
        song_count: playlist.playlist_songs?.[0]?.count || 0
      })) || [];

      setPlaylists(playlistsWithCount);
    } catch (error) {
      console.error('Error fetching playlists:', error);
      toast({
        title: "Error",
        description: "Failed to load playlists",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylist.name.trim()) {
      toast({
        title: "Error",
        description: "Playlist name is required",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('playlists')
        .insert({
          user_id: user?.id,
          name: newPlaylist.name.trim(),
          description: newPlaylist.description.trim(),
          is_public: newPlaylist.isPublic
        })
        .select()
        .single();

      if (error) throw error;

      setPlaylists(prev => [{ ...data, song_count: 0 }, ...prev]);
      setNewPlaylist({ name: '', description: '', isPublic: false });
      setShowCreateDialog(false);
      
      toast({
        title: "Playlist created",
        description: `"${data.name}" has been created`
      });
    } catch (error) {
      console.error('Error creating playlist:', error);
      toast({
        title: "Error",
        description: "Failed to create playlist",
        variant: "destructive"
      });
    }
  };

  const deletePlaylist = async (playlistId: string, playlistName: string) => {
    try {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId);

      if (error) throw error;

      setPlaylists(prev => prev.filter(p => p.id !== playlistId));
      toast({
        title: "Playlist deleted",
        description: `"${playlistName}" has been deleted`
      });
    } catch (error) {
      console.error('Error deleting playlist:', error);
      toast({
        title: "Error",
        description: "Failed to delete playlist",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading playlists...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 pb-32 md:px-10 md:py-8 space-y-7 max-w-[92rem] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground mb-2">Built by you</p><h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Playlists</h1>
          <p className="text-muted-foreground">
            {playlists.length} playlist{playlists.length !== 1 ? 's' : ''}
          </p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="btn-silver px-5 h-10 text-xs hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Create Playlist
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card">
            <DialogHeader>
              <DialogTitle>Create New Playlist</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="playlist-name">Name</Label>
                <Input
                  id="playlist-name"
                  placeholder="My Awesome Playlist"
                  value={newPlaylist.name}
                  onChange={(e) => setNewPlaylist(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="playlist-description">Description (optional)</Label>
                <Textarea
                  id="playlist-description"
                  placeholder="Describe your playlist..."
                  value={newPlaylist.description}
                  onChange={(e) => setNewPlaylist(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={createPlaylist} className="btn-silver hover:opacity-90">
                  Create Playlist
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Playlists Grid */}
      {playlists.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {playlists.map((playlist) => (
              <Card key={playlist.id} className="group cursor-pointer overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] transition-colors duration-200 hover:bg-foreground/[0.05]">
                <CardContent className="p-4">
                  <div 
                    className="space-y-3"
                    onClick={() => onViewPlaylist(playlist.id)}
                  >
                    <div className="relative aspect-[1.35/1] overflow-hidden rounded-xl border border-foreground/10 bg-[radial-gradient(circle_at_18%_18%,hsl(var(--foreground)/.28),transparent_42%),linear-gradient(145deg,hsl(var(--foreground)/.14),hsl(var(--card)/.8)_55%,hsl(var(--foreground)/.05))] flex items-center justify-center">
                      {playlist.cover_image_url ? (
                        <img
                          src={playlist.cover_image_url}
                          alt={playlist.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-foreground/60"><ListMusic className="w-12 h-12" /><span className="text-[10px] font-semibold uppercase tracking-[0.3em]">Sonora mix</span></div>
                      )}
                      <div className="absolute inset-0 bg-black/35 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          size="sm"
                          className="h-12 w-12 p-0 rounded-full border border-white/25 bg-white/90 text-slate-950 shadow-xl hover:bg-white"
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Fetch all songs for this playlist and play all
                            const { data: songsData, error: songsError } = await supabase
                              .from('playlist_songs')
                              .select('*')
                              .eq('playlist_id', playlist.id)
                              .order('added_at', { ascending: true });
                            if (songsError || !songsData || songsData.length === 0) return;
                            const tracks = songsData.map(song => ({
                              id: song.id,
                              title: song.title,
                              artist: song.artist || 'Unknown Artist',
                              thumbnail: song.thumbnail_url || '/placeholder.svg',
                              videoId: song.youtube_video_id
                            }));
                            onPlayTrack(tracks[0], tracks);
                          }}
                        >
                          <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-base truncate">{playlist.name}</h3><Sparkles className="h-4 w-4 shrink-0 text-foreground/40" /></div>
                      <p className="text-xs text-muted-foreground">
                        {playlist.song_count} song{playlist.song_count !== 1 ? 's' : ''}
                      </p>
                      {playlist.description && (
                        <p className="text-xs text-muted-foreground truncate">{playlist.description}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-2 mt-4 border-t border-foreground/[0.08] pt-3">
                    <SharePlaylistDialog
                      playlistId={playlist.id}
                      playlistName={playlist.name}
                      currentUserId={user?.id || ''}
                      triggerClassName="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePlaylist(playlist.id, playlist.name);
                      }}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Music className="w-16 h-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-lg font-medium">No playlists yet</h3>
            <p className="text-muted-foreground">Create your first playlist to get started</p>
          </div>
        </div>
      )}
    </div>
  );
};