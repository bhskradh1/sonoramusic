import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Music, Play, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { getSharedPlaylistsWithMe } from '@/lib/playlistSharing';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface SharedPlaylist {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  cover_image_url: string;
  created_at: string;
  shared_by_user_id: string;
  shared_by_username?: string;
  shared_at: string;
  song_count?: number;
}

interface SharedPlaylistsViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
  onViewPlaylist: (playlistId: string) => void;
}

export const SharedPlaylistsView: React.FC<SharedPlaylistsViewProps> = ({
  onPlayTrack,
  onViewPlaylist,
}) => {
  const [playlists, setPlaylists] = useState<SharedPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchSharedPlaylists();
    }
  }, [user]);

  const fetchSharedPlaylists = async () => {
    try {
      const result = await getSharedPlaylistsWithMe(user?.id || '');
      if (result.success && result.data) {
        setPlaylists(result.data);
      } else {
        throw new Error('Failed to fetch shared playlists');
      }
    } catch (error) {
      console.error('Error fetching shared playlists:', error);
      toast({
        title: 'Error',
        description: 'Failed to load shared playlists',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading shared playlists...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Shared with Me</h1>
        <p className="text-muted-foreground">
          {playlists.length} playlist{playlists.length !== 1 ? 's' : ''} shared with
          you
        </p>
      </div>

      {/* Shared Playlists Grid */}
      {playlists.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {playlists.map((playlist) => (
            <Card key={playlist.id} className="glass-card hover-lift group cursor-pointer">
              <CardContent className="p-4">
                <div
                  className="space-y-3"
                  onClick={() => onViewPlaylist(playlist.id)}
                >
                  <div className="relative aspect-square bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center">
                    {playlist.cover_image_url ? (
                      <img
                        src={playlist.cover_image_url}
                        alt={playlist.name}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <Music className="w-12 h-12 text-muted-foreground" />
                    )}
                    <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        size="sm"
                        className="h-10 w-10 p-0 rounded-full bg-primary hover:bg-primary/90"
                        onClick={async (e) => {
                          e.stopPropagation();
                          // Fetch all songs for this playlist and play all
                          const { data: songsData, error: songsError } =
                            await supabase
                              .from('playlist_songs')
                              .select('*')
                              .eq('playlist_id', playlist.id)
                              .order('added_at', { ascending: true });
                          if (songsError || !songsData || songsData.length === 0)
                            return;
                          const tracks = songsData.map((song) => ({
                            id: song.id,
                            title: song.title,
                            artist: song.artist || 'Unknown Artist',
                            thumbnail: song.thumbnail_url || '/placeholder.svg',
                            videoId: song.youtube_video_id,
                          }));
                          onPlayTrack(tracks[0], tracks);
                        }}
                      >
                        <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-medium text-sm truncate">
                      {playlist.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {playlist.song_count} song
                      {playlist.song_count !== 1 ? 's' : ''}
                    </p>
                    {playlist.shared_by_username && (
                      <p className="text-xs text-primary truncate">
                        Shared by @{playlist.shared_by_username}
                      </p>
                    )}
                    {playlist.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {playlist.description}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Music className="w-16 h-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-lg font-medium">No shared playlists yet</h3>
            <p className="text-muted-foreground">
              Other users will share playlists with you here
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
