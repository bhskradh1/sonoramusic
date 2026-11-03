import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  OFFLINE_UPDATED_EVENT,
  clearOfflineLibrary,
  getAllOfflineTracks,
  getOfflinePlaylistSummaries,
  removePlaylistOffline,
  type OfflinePlaylistSummary,
  type OfflineTrackRecord,
} from '@/lib/offlineLibrary';

/** Read-only view of playlist-level offline downloads. Individual track saves are intentionally unsupported. */
export const useOfflineLibrary = () => {
  const [tracks, setTracks] = useState<OfflineTrackRecord[]>([]);
  const [playlists, setPlaylists] = useState<OfflinePlaylistSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [offlineTracks, offlinePlaylists] = await Promise.all([
        getAllOfflineTracks(),
        getOfflinePlaylistSummaries(),
      ]);
      setTracks(offlineTracks);
      setPlaylists(offlinePlaylists);
    } catch (error) {
      console.warn('Could not refresh offline library:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(OFFLINE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(OFFLINE_UPDATED_EVENT, refresh);
  }, [refresh]);

  const downloadedTrackIds = useMemo(() => new Set(tracks.map((track) => track.track_id)), [tracks]);
  const isSaved = useCallback((trackId: string) => downloadedTrackIds.has(trackId), [downloadedTrackIds]);

  return {
    tracks,
    playlists,
    isSaved,
    removePlaylist: removePlaylistOffline,
    clearAll: clearOfflineLibrary,
    refresh,
  };
};
