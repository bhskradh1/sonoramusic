import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, ArrowLeft, Music, Trash2, ListMusic, Sparkles, Download, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  OFFLINE_UPDATED_EVENT,
  downloadPlaylistOffline,
  isPlaylistDownloaded,
  removePlaylistOffline,
} from '@/lib/offlineLibrary';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
  playlistId?: string;
}

interface PlaylistSong {
  id: string;
  playlist_id: string;
  youtube_video_id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  added_at: string;
  duration?: string | number;
}

interface Playlist {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  cover_image_url: string;
  created_at: string;
}

interface PlaylistDetailViewProps {
  playlistId: string;
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
  onBack: () => void;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({ 
  playlistId, 
  onPlayTrack, 
  onBack 
}) => {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineDownloaded, setIsOfflineDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ completed: 0, total: 0, currentTitle: '' });
  const { toast } = useToast();

  const refreshOfflineStatus = useCallback(async () => {
    if (!playlistId) return;
    try {
      setIsOfflineDownloaded(await isPlaylistDownloaded(
        playlistId,
        songs.map((song) => ({ trackId: song.id, videoId: song.youtube_video_id })),
      ));
    } catch (error) {
      console.warn('Could not check playlist offline status:', error);
    }
  }, [playlistId, songs.length]);

  useEffect(() => {
    if (playlistId) {
      setLoading(true);
      fetchPlaylistDetails();
      void refreshOfflineStatus();
    }
  }, [playlistId, refreshOfflineStatus]);

  useEffect(() => {
    window.addEventListener(OFFLINE_UPDATED_EVENT, refreshOfflineStatus);
    return () => window.removeEventListener(OFFLINE_UPDATED_EVENT, refreshOfflineStatus);
  }, [refreshOfflineStatus]);

  const fetchPlaylistDetails = async () => {
    try {
      // Fetch playlist info
      const { data: playlistData, error: playlistError } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', playlistId)
        .single();

      if (playlistError) throw playlistError;
      setPlaylist(playlistData);

      // Fetch playlist songs
      const { data: songsData, error: songsError } = await supabase
        .from('playlist_songs')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('added_at', { ascending: true });

      if (songsError) throw songsError;
      setSongs(songsData || []);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
      toast({
        title: "Error",
        description: "Failed to load playlist",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const playSong = (song: PlaylistSong) => {
    // Convert all songs to tracks and pass as playlist, starting from clicked song
    const tracks = songs.map(s => ({
      id: s.id,
      playlistId,
      title: s.title,
      artist: s.artist || 'Unknown Artist',
      thumbnail: s.thumbnail_url || '/placeholder.svg',
      videoId: s.youtube_video_id,
      duration: String(s.duration ?? ''),
    }));
    const clickedTrack = tracks.find(t => t.id === song.id) || tracks[0];
    onPlayTrack(clickedTrack, tracks);
  };

  const handleDownloadPlaylist = async () => {
    if (!playlist || songs.length === 0 || isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress({ completed: 0, total: songs.length, currentTitle: '' });
    try {
      const result = await downloadPlaylistOffline(
        playlistId,
        playlist.name,
        songs.map((song) => ({
          trackId: song.id,
          videoId: song.youtube_video_id,
          title: song.title,
          artist: song.artist || 'Unknown Artist',
          duration: String(song.duration ?? ''),
          thumbnailUrl: song.thumbnail_url || '/placeholder.svg',
        })),
        setDownloadProgress,
      );
      setIsOfflineDownloaded(true);
      toast({
        title: result.skipped ? 'Playlist already downloaded' : 'Playlist downloaded',
        description: result.skipped
          ? `“${playlist.name}” is ready for offline playback.`
          : `${result.downloaded} tracks from “${playlist.name}” are saved on this device.`,
      });
    } catch (error) {
      setIsOfflineDownloaded(false);
      toast({
        title: 'Playlist download failed',
        description: error instanceof Error ? error.message : 'Could not save every track. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ completed: 0, total: 0, currentTitle: '' });
      await refreshOfflineStatus();
    }
  };

  const handleRemoveOfflineDownload = async () => {
    try {
      await removePlaylistOffline(playlistId);
      setIsOfflineDownloaded(false);
      toast({ title: 'Offline download removed', description: `“${playlist?.name || 'Playlist'}” was removed from this device.` });
    } catch (error) {
      toast({
        title: 'Could not remove offline download',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const removeSongFromPlaylist = async (songId: string, songTitle: string) => {
    try {
      const { error } = await supabase
        .from('playlist_songs')
        .delete()
        .eq('id', songId);

      if (error) throw error;

      setSongs(prev => prev.filter(song => song.id !== songId));
      toast({
        title: "Removed",
        description: `"${songTitle}" removed from playlist`
      });
    } catch (error) {
      console.error('Error removing song from playlist:', error);
      toast({
        title: "Error",
        description: "Failed to remove song",
        variant: "destructive"
      });
    }
  };

  const playAllSongs = () => {
    if (songs.length > 0) {
      // Convert PlaylistSong[] to Track[]
      const tracks = songs.map(song => ({
        id: song.id,
        playlistId,
        title: song.title,
        artist: song.artist || 'Unknown Artist',
        thumbnail: song.thumbnail_url || '/placeholder.svg',
        videoId: song.youtube_video_id,
        duration: String(song.duration ?? ''),
      }));
      // Play all songs by passing the playlist and starting from the first
      onPlayTrack(tracks[0], tracks);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading playlist...</p>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Playlist not found</h2>
          <p className="text-muted-foreground">The playlist you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8 space-y-7 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Playlist Info */}
      <div className="relative flex flex-col sm:flex-row items-start gap-6 overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-br from-foreground/[0.10] via-card/50 to-foreground/[0.025] p-5 md:p-7 shadow-xl backdrop-blur-2xl">
        <div className="relative w-full sm:w-48 h-48 shrink-0 overflow-hidden rounded-2xl border border-foreground/10 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--foreground)/.30),transparent_42%),linear-gradient(145deg,hsl(var(--foreground)/.16),hsl(var(--card)/.8)_55%,hsl(var(--foreground)/.04))] flex items-center justify-center shadow-xl">
          {playlist.cover_image_url ? (
            <img
              src={playlist.cover_image_url}
              alt={playlist.name}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-foreground/60"><ListMusic className="w-16 h-16" /><span className="text-[10px] font-semibold uppercase tracking-[0.3em]">Sonora</span></div>
          )}
        </div>
        
        <div className="flex-1 space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Your collection</p><h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">{playlist.name}</h1>
            {playlist.description && (
              <p className="text-muted-foreground mb-4">{playlist.description}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {songs.length} song{songs.length !== 1 ? 's' : ''} • Created {new Date(playlist.created_at).toLocaleDateString()}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={playAllSongs}
              disabled={songs.length === 0}
              className="rounded-full bg-foreground text-background shadow-lg hover:bg-foreground/90"
            >
              <Play className="w-4 h-4 mr-2" />
              Play All
            </Button>
            {isOfflineDownloaded ? (
              <Button
                variant="outline"
                onClick={handleRemoveOfflineDownload}
                className="rounded-full"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove Offline Download
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleDownloadPlaylist}
                disabled={songs.length === 0 || isDownloading}
                className="rounded-full"
              >
                {isDownloading
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Download className="mr-2 h-4 w-4" />}
                {isDownloading
                  ? `Downloading ${downloadProgress.completed}/${downloadProgress.total || songs.length}`
                  : 'Download Playlist for Offline'}
              </Button>
            )}
          </div>
          {isDownloading && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Saving {downloadProgress.currentTitle || 'playlist audio'} · {downloadProgress.completed} of {downloadProgress.total || songs.length}
            </p>
          )}
          {isOfflineDownloaded && (
            <p className="flex items-center gap-2 text-xs text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" /> All {songs.length} tracks are stored on this device.
            </p>
          )}
        </div>
      </div>

      {/* Songs List */}
      <div className="space-y-2">
        <div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-1">In this mix</p><h2 className="text-xl font-semibold">Tracks</h2></div><span className="text-xs text-muted-foreground">{songs.length} total</span></div>
        
        {songs.length > 0 ? (
          <div className="space-y-2">
            {songs.map((song, index) => (
              <Card key={song.id} className="overflow-hidden rounded-2xl border border-foreground/[0.09] bg-gradient-to-r from-foreground/[0.065] to-card/35 backdrop-blur-xl transition-colors hover:border-foreground/20 hover:bg-foreground/[0.08]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-7 text-center font-mono text-xs text-muted-foreground/70">
                      {index + 1}
                    </div>
                    
                    <div className="relative group">
                      <img
                        src={song.thumbnail_url || '/placeholder.svg'}
                        alt={song.title}
                        className="w-12 h-12 rounded-xl object-cover shadow-md"
                      />
                      <div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          size="sm"
                          className="h-6 w-6 p-0 rounded-full bg-primary hover:bg-primary/90"
                          onClick={() => playSong(song)}
                        >
                          <Play className="w-3 h-3 text-primary-foreground ml-0.5" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm mb-1 truncate">{song.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-primary/20 hover:text-primary"
                        onClick={() => playSong(song)}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => removeSongFromPlaylist(song.id, song.title)}
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
            <Music className="w-16 h-16 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-medium">No songs in this playlist</h3>
              <p className="text-muted-foreground">Add some songs to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
