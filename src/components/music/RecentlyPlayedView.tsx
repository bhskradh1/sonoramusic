import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Clock, Trash2 } from 'lucide-react';
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

interface RecentlyPlayedSong {
  id: string;
  youtube_video_id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  played_at: string;
}

interface RecentlyPlayedViewProps {
  onPlayTrack: (track: Track) => void;
}

export const RecentlyPlayedView: React.FC<RecentlyPlayedViewProps> = ({ onPlayTrack }) => {
  const [recentSongs, setRecentSongs] = useState<RecentlyPlayedSong[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchRecentlyPlayed();
    }
  }, [user]);

  const fetchRecentlyPlayed = async () => {
    try {
      console.log('Fetching recently played for user:', user?.id);
      const { data, error } = await supabase
        .from('recently_played')
        .select('*')
        .eq('user_id', user?.id)
        .order('played_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      console.log('Recently played data:', data);
      setRecentSongs(data || []);
    } catch (error) {
      console.error('Error fetching recently played:', error);
      toast({
        title: "Error",
        description: "Failed to load recently played songs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const clearRecentlyPlayed = async () => {
    try {
      const { error } = await supabase
        .from('recently_played')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;

      setRecentSongs([]);
      toast({
        title: "Cleared",
        description: "Recently played history cleared"
      });
    } catch (error) {
      console.error('Error clearing recently played:', error);
      toast({
        title: "Error",
        description: "Failed to clear history",
        variant: "destructive"
      });
    }
  };

  const playRecentSong = (song: RecentlyPlayedSong) => {
    const track: Track = {
      id: song.id,
      title: song.title,
      artist: song.artist || 'Unknown Artist',
      thumbnail: song.thumbnail_url || '/placeholder.svg',
      videoId: song.youtube_video_id
    };
    console.log('Playing recent song:', track);
    console.log('Original song data:', song);
    onPlayTrack(track);
  };

  const formatPlayedTime = (playedAt: string) => {
    const date = new Date(playedAt);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading recently played...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Recently Played</h1>
              <p className="text-muted-foreground">
                {recentSongs.length} song{recentSongs.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
        
        {recentSongs.length > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={clearRecentlyPlayed}
            className="hover:bg-destructive/20 hover:text-destructive hover:border-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear History
          </Button>
        )}
      </div>

      {/* Recently Played List */}
      {recentSongs.length > 0 ? (
        <div className="space-y-2">
          {recentSongs.map((song, index) => (
            <Card key={`${song.id}-${song.played_at}`} className="glass-card hover-lift">
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
                        onClick={() => playRecentSong(song)}
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
                    <span>{formatPlayedTime(song.played_at)}</span>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-primary/20 hover:text-primary"
                    onClick={() => playRecentSong(song)}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Clock className="w-16 h-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-lg font-medium">No recently played songs</h3>
            <p className="text-muted-foreground">Songs you play will appear here</p>
          </div>
        </div>
      )}
    </div>
  );
};