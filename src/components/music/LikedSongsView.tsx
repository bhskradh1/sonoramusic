import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Play, Trash2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface LikedSong {
  id: string;
  youtube_video_id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  liked_at: string;
}

interface LikedSongsViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
}

export const LikedSongsView: React.FC<LikedSongsViewProps> = ({ onPlayTrack }) => {
  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchLikedSongs();
    }
  }, [user]);

  const fetchLikedSongs = async () => {
    try {
      const { data, error } = await supabase
        .from('liked_songs')
        .select('*')
        .order('liked_at', { ascending: false });

      if (error) throw error;
      setLikedSongs(data || []);
    } catch (error) {
      console.error('Error fetching liked songs:', error);
      toast({
        title: "Error",
        description: "Failed to load liked songs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const removeLikedSong = async (songId: string) => {
    try {
      const { error } = await supabase
        .from('liked_songs')
        .delete()
        .eq('id', songId);

      if (error) throw error;

      setLikedSongs(prev => prev.filter(song => song.id !== songId));
      toast({
        title: "Song removed",
        description: "Song removed from liked songs"
      });
    } catch (error) {
      console.error('Error removing liked song:', error);
      toast({
        title: "Error",
        description: "Failed to remove song",
        variant: "destructive"
      });
    }
  };

  const getLikedTracks = (): Track[] => likedSongs.map(song => ({
    id: song.id,
    title: song.title,
    artist: song.artist || 'Unknown Artist',
    thumbnail: song.thumbnail_url || '/placeholder.svg',
    videoId: song.youtube_video_id,
  }));

  const playLikedSong = (song: LikedSong) => {
    const tracks = getLikedTracks();
    const selectedTrack = tracks.find(track => track.id === song.id);
    if (!selectedTrack) return;

    // Pass the complete liked-songs queue so Next advances through the list.
    onPlayTrack(selectedTrack, tracks);
  };

  const playAllLikedSongs = () => {
    const tracks = getLikedTracks();
    if (tracks.length > 0) onPlayTrack(tracks[0], tracks);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading liked songs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-red-500 rounded-lg flex items-center justify-center">
            <Heart className="w-6 h-6 text-white fill-current" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Liked Songs</h1>
            <p className="text-muted-foreground">
              {likedSongs.length} song{likedSongs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            onClick={playAllLikedSongs}
            disabled={likedSongs.length === 0}
            className="bg-gradient-primary hover:opacity-90"
          >
            <Play className="w-4 h-4 mr-2 fill-current" />
            Play All
          </Button>
        </div>
      </div>

      {/* Liked Songs List */}
      {likedSongs.length > 0 ? (
        <div className="space-y-2">
          {likedSongs.map((song, index) => (
            <Card key={song.id} className="glass-card hover-lift">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 text-center text-muted-foreground text-sm">
                    {index + 1}
                  </div>
                  
                  <div className="relative group">
                    <img
                      src={song.thumbnail_url || '/placeholder.svg'}
                      alt={song.title}
                      className="w-12 h-12 rounded object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        size="sm"
                        className="h-6 w-6 p-0 rounded-full bg-primary hover:bg-primary/90"
                        onClick={() => playLikedSong(song)}
                      >
                        <Play className="w-3 h-3 text-primary-foreground ml-0.5" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm mb-1 truncate">{song.title}</h3>
                    <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(song.liked_at).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-signal hover:text-signal/80"
                      onClick={() => removeLikedSong(song.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Heart className="w-16 h-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-lg font-medium">No liked songs yet</h3>
            <p className="text-muted-foreground">Songs you like will appear here</p>
          </div>
        </div>
      )}
    </div>
  );
};