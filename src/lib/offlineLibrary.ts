import { fetchYoutubeAudioBlob } from './youtubeAudioApi';

/**
 * Permanent playlist downloads backed by IndexedDB.
 * Individual tracks are intentionally not exposed as download operations;
 * records are only created by the playlist-level download workflow.
 */
export interface OfflineTrackRecord {
  playlist_id: string;
  playlist_name: string;
  playlist_track_count: number;
  track_id: string;
  track_position: number;
  video_id: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail_base64: string;
  blob: Blob;
  mime_type: string;
  byte_size: number;
  downloaded_at: string;
  is_complete: boolean;
}

export interface PlaylistDownloadTrack {
  trackId: string;
  videoId: string;
  title: string;
  artist: string;
  duration?: string | number;
  thumbnailUrl?: string;
}

export interface OfflinePlaylistSummary {
  playlistId: string;
  playlistName: string;
  trackCount: number;
  downloadedAt: string;
  cover: string;
  tracks: OfflineTrackRecord[];
}

export interface PlaylistDownloadProgress {
  completed: number;
  total: number;
  currentTitle: string;
}

export interface PlaylistDownloadResult {
  downloaded: number;
  skipped: boolean;
}

const DB_NAME = 'melodiya_offline_library';
const DB_VERSION = 1;
const STORE_NAME = 'offline_tracks';
export const OFFLINE_UPDATED_EVENT = 'melodiya-offline-updated';

let databasePromise: Promise<IDBDatabase> | null = null;

const emitUpdate = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_UPDATED_EVENT));
  }
};

const openDatabase = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support IndexedDB offline storage.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: ['playlist_id', 'track_id'],
        });
        store.createIndex('playlist_id', 'playlist_id', { unique: false });
        store.createIndex('track_id', 'track_id', { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Could not open offline storage.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Offline storage is busy in another tab. Close other app tabs and try again.'));
    };
  });
  return databasePromise;
};

const requestValue = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
  });

const requestPersistentStorage = async () => {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // Persistent-storage permission is browser-controlled and best-effort.
  }
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const fallbackArtwork = () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="28" fill="#202124"/><path d="M105 65v116a28 28 0 1 1-16-25V87l94-22v88a28 28 0 1 1-16-25V45z" fill="#d4d4d8"/></svg>';
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const thumbnailAsBase64 = async (url?: string): Promise<string> => {
  if (url?.startsWith('data:image/')) return url;
  if (url) {
    try {
      const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.type.startsWith('image/')) {
          return `data:${blob.type};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`;
        }
      }
    } catch {
      // A neutral embedded artwork fallback still makes the offline playlist usable.
    }
  }
  return fallbackArtwork();
};

export const getAllOfflineTracks = async (): Promise<OfflineTrackRecord[]> => {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const result = await requestValue(tx.objectStore(STORE_NAME).getAll()) as OfflineTrackRecord[];
  await transactionDone(tx);
  return result.filter((track) => track.is_complete);
};

export const getOfflineTrack = async (
  trackId: string,
  playlistId?: string,
): Promise<OfflineTrackRecord | undefined> => {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  let result: OfflineTrackRecord | undefined;
  if (playlistId) {
    result = await requestValue(store.get([playlistId, trackId])) as OfflineTrackRecord | undefined;
  } else {
    const matches = await requestValue(store.index('track_id').getAll(IDBKeyRange.only(trackId))) as OfflineTrackRecord[];
    result = matches.find((track) => track.is_complete);
  }
  await transactionDone(tx);
  return result?.is_complete ? result : undefined;
};

export const getOfflinePlaylistRecords = async (playlistId: string): Promise<OfflineTrackRecord[]> => {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const records = await requestValue(
    tx.objectStore(STORE_NAME).index('playlist_id').getAll(IDBKeyRange.only(playlistId)),
  ) as OfflineTrackRecord[];
  await transactionDone(tx);
  return records;
};

export const getOfflinePlaylistSummaries = async (): Promise<OfflinePlaylistSummary[]> => {
  const records = await getAllOfflineTracks();
  const grouped = new Map<string, OfflineTrackRecord[]>();
  for (const record of records) {
    const items = grouped.get(record.playlist_id) || [];
    items.push(record);
    grouped.set(record.playlist_id, items);
  }
  return [...grouped.entries()].map(([playlistId, tracks]) => {
    tracks.sort((a, b) => a.track_position - b.track_position);
    const first = tracks[0];
    return {
      playlistId,
      playlistName: first.playlist_name,
      trackCount: tracks.length,
      downloadedAt: first.downloaded_at,
      cover: first.thumbnail_base64,
      tracks,
    };
  }).sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
};

export const getOfflineTrackCount = async (): Promise<number> =>
  (await getAllOfflineTracks()).length;

export const isPlaylistDownloaded = async (
  playlistId: string,
  expectedTracks?: Array<Pick<PlaylistDownloadTrack, 'trackId' | 'videoId'>>,
): Promise<boolean> => {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const matches = await requestValue(
    tx.objectStore(STORE_NAME).index('playlist_id').getAll(IDBKeyRange.only(playlistId)),
  ) as OfflineTrackRecord[];
  await transactionDone(tx);

  if (!matches.length || !matches.every((track) => track.is_complete)) return false;
  if (expectedTracks) {
    if (matches.length !== expectedTracks.length || expectedTracks.length === 0) return false;
    const savedById = new Map(matches.map((track) => [track.track_id, track.video_id]));
    return expectedTracks.every((track) => savedById.get(track.trackId) === track.videoId);
  }
  return true;
};

const removePlaylistRecords = async (playlistId: string, notify = true) => {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const cursorRequest = store.index('playlist_id').openCursor(IDBKeyRange.only(playlistId));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
  await transactionDone(tx);
  if (notify) emitUpdate();
};

export const removePlaylistOffline = async (playlistId: string): Promise<void> => {
  await removePlaylistRecords(playlistId);
};

export const downloadPlaylistOffline = async (
  playlistId: string,
  playlistName: string,
  tracks: PlaylistDownloadTrack[],
  onProgress?: (progress: PlaylistDownloadProgress) => void,
): Promise<PlaylistDownloadResult> => {
  if (!playlistId) throw new Error('A playlist ID is required for offline downloads.');
  if (!tracks.length) throw new Error('This playlist does not contain any tracks.');

  const existingRecords = await getOfflinePlaylistRecords(playlistId);
  const existingById = new Map(existingRecords.map((record) => [record.track_id, record]));
  const alreadyDownloaded = existingRecords.length === tracks.length && tracks.every((track) => {
    const existing = existingById.get(track.trackId);
    return Boolean(
      existing?.is_complete &&
      existing.video_id === track.videoId &&
      existing.playlist_name === playlistName
    );
  });
  if (alreadyDownloaded) return { downloaded: 0, skipped: true };

  await requestPersistentStorage();
  await removePlaylistRecords(playlistId, false);
  const downloadedAt = new Date().toISOString();
  let completed = 0;

  try {
    for (const [trackIndex, track] of tracks.entries()) {
      if (!/^[a-zA-Z0-9_-]{11}$/.test(track.videoId)) {
        throw new Error(`“${track.title}” does not have a valid YouTube video ID.`);
      }
      onProgress?.({ completed, total: tracks.length, currentTitle: track.title });
      const [blob, thumbnail] = await Promise.all([
        fetchYoutubeAudioBlob(track.videoId),
        thumbnailAsBase64(track.thumbnailUrl),
      ]);
      const record: OfflineTrackRecord = {
        playlist_id: playlistId,
        playlist_name: playlistName,
        playlist_track_count: tracks.length,
        track_id: track.trackId,
        track_position: trackIndex,
        video_id: track.videoId,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        duration: String(track.duration ?? ''),
        thumbnail_base64: thumbnail,
        blob,
        mime_type: blob.type || 'application/octet-stream',
        byte_size: blob.size,
        downloaded_at: downloadedAt,
        is_complete: false,
      };
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      await transactionDone(tx);
      completed += 1;
      onProgress?.({ completed, total: tracks.length, currentTitle: track.title });
    }

    // Publish the playlist only after every track has been downloaded and stored.
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const cursorRequest = store.index('playlist_id').openCursor(IDBKeyRange.only(playlistId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const record = cursor.value as OfflineTrackRecord;
      cursor.update({ ...record, is_complete: true });
      cursor.continue();
    };
    await transactionDone(tx);
    emitUpdate();
    return { downloaded: completed, skipped: false };
  } catch (error) {
    await removePlaylistRecords(playlistId, false).catch(() => undefined);
    throw error;
  }
};

export const clearOfflineLibrary = async (): Promise<void> => {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
  await transactionDone(tx);
  try {
    localStorage.removeItem('melodiya_offline_tracks');
    if ('caches' in window) await caches.delete('melodiya-offline-art');
  } catch {
    // Legacy metadata/art cleanup is best-effort; IndexedDB deletion has completed.
  }
  emitUpdate();
};
