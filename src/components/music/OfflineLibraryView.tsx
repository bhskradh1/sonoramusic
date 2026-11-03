import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, HardDriveDownload, Loader2, Play, Trash2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  OFFLINE_UPDATED_EVENT,
  getOfflinePlaylistSummaries,
  removePlaylistOffline,
  type OfflinePlaylistSummary,
} from '@/lib/offlineLibrary';

interface Track {
  id: string;
  playlistId: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface OfflineLibraryViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
}

export const OfflineLibraryView: React.FC<OfflineLibraryViewProps> = ({ onPlayTrack }) => {
  const [playlists, setPlaylists] = useState<OfflinePlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    try {
      setPlaylists(await getOfflinePlaylistSummaries());
    } catch (error) {
      console.error('Could not read offline playlists:', error);
      toast({
        title: 'Offline library unavailable',
        description: error instanceof Error ? error.message : 'Could not open local downloads.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
    window.addEventListener(OFFLINE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(OFFLINE_UPDATED_EVENT, refresh);
  }, [refresh]);

  const toTracks = (playlist: OfflinePlaylistSummary): Track[] => playlist.tracks.map((record) => ({
    id: record.track_id,
    playlistId: record.playlist_id,
    title: record.title,
    artist: record.artist,
    thumbnail: record.thumbnail_base64,
    videoId: record.video_id,
    duration: record.duration,
  }));

  const playPlaylist = (playlist: OfflinePlaylistSummary, startTrackId?: string) => {
    const tracks = toTracks(playlist);
    const track = tracks.find((item) => item.id === startTrackId) || tracks[0];
    if (track) onPlayTrack(track, tracks);
  };

  const removePlaylist = async (playlist: OfflinePlaylistSummary) => {
    setRemovingId(playlist.playlistId);
    try {
      await removePlaylistOffline(playlist.playlistId);
      toast({ title: 'Offline download removed', description: `Removed “${playlist.playlistName}” and its audio files from this device.` });
    } catch (error) {
      toast({ title: 'Could not remove download', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setRemovingId(null);
      await refresh();
    }
  };

  return (
    <div className="mx-auto max-w-[92rem] space-y-7 px-5 pb-32 pt-6 md:px-10 md:pt-9">
      <header className="flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-foreground/10 bg-foreground/[0.06] text-zinc-200">
          <WifiOff className="h-5 w-5" />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">No connection</p>
          <h1 className="text-3xl font-medium tracking-[-.045em] text-zinc-100 md:text-4xl">Offline Library</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Only playlists fully downloaded to this device are shown here.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[35vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading downloads…
        </div>
      ) : playlists.length === 0 ? (
        <Card className="rounded-3xl border border-foreground/10 bg-foreground/[0.025]">
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <HardDriveDownload className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-medium text-zinc-200">No offline playlists yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Reconnect to the internet, open a playlist, and choose “Download Playlist for Offline”.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {playlists.map((playlist) => (
            <Card key={playlist.playlistId} className="overflow-hidden rounded-3xl border border-foreground/[0.09] bg-foreground/[0.025]">
              <CardContent className="p-4 md:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <img
                    src={playlist.cover}
                    alt=""
                    className="size-20 shrink-0 rounded-2xl border border-foreground/10 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-500">Downloaded</span>
                    </div>
                    <h2 className="mt-1 truncate text-lg font-semibold text-zinc-100">{playlist.playlistName}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {playlist.trackCount} tracks · Saved {new Date(playlist.downloadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button onClick={() => playPlaylist(playlist)} className="rounded-full">
                      <Play className="mr-2 h-4 w-4" /> Play playlist
                    </Button>
                    <Button
                      variant="outline"
                      disabled={removingId === playlist.playlistId}
                      onClick={() => void removePlaylist(playlist)}
                      className="rounded-full"
                    >
                      {removingId === playlist.playlistId
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Trash2 className="mr-2 h-4 w-4" />}
                      Remove download
                    </Button>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-foreground/[0.07]">
                  {playlist.tracks.map((track, index) => (
                    <button
                      key={track.track_id}
                      type="button"
                      onClick={() => playPlaylist(playlist, track.track_id)}
                      className="group grid w-full grid-cols-[1.5rem_2.75rem_minmax(0,1fr)_2rem] items-center gap-3 border-b border-foreground/[0.06] px-3 py-2.5 text-left last:border-0 hover:bg-foreground/[0.04]"
                    >
                      <span className="text-center text-[10px] text-zinc-600">{index + 1}</span>
                      <img src={track.thumbnail_base64} alt="" className="size-10 rounded-lg object-cover" />
                      <span className="min-w-0">
                        <strong className="block truncate text-sm font-medium text-zinc-200">{track.title}</strong>
                        <small className="mt-0.5 block truncate text-xs text-muted-foreground">{track.artist}</small>
                      </span>
                      <Play className="h-4 w-4 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
