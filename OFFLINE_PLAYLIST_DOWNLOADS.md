# Offline playlist downloads

Melodiya stores playlist audio in the browser's IndexedDB database `melodiya_offline_library`, object store `offline_tracks`.

## How it works

- Downloads are initiated from a playlist's detail page with **Download Playlist for Offline**. There is intentionally no individual-track download action.
- The browser requests each track's binary audio from `/api/youtube-audio?id=<video-id>&stream=1` and stores the resulting `Blob` with title, artist, duration, base64 artwork, playlist ID, track ID, and playback position.
- The object store uses the compound key `[playlist_id, track_id]` and indexes `playlist_id` and `track_id`.
- A playlist is marked complete only after every track has been fetched and committed. Failed downloads are rolled back, so partial playlists are not presented as available offline.
- When `navigator.onLine` becomes false, the app switches to **Offline Library**. Search and online discovery/navigation are hidden. Playback reads the matching Blob from IndexedDB and uses a temporary `URL.createObjectURL()` URL; that temporary URL is revoked when the track changes or the player unmounts.
- **Remove Offline Download** deletes all records for that playlist. Settings also includes a clear-all action.

## API configuration

Set `VITE_YTMUSIC_AUDIO_API_URL` to the deployed audio API route when the frontend and API do not share an origin, for example:

```env
VITE_YTMUSIC_AUDIO_API_URL=https://your-deployment.example/api/youtube-audio
```

The API route must support its JSON resolver response and its binary `?id=<video-id>&stream=1` response. The existing `api/youtube-audio.ts` route implements both.

## Storage limits

The app requests persistent browser storage before downloading a playlist (`navigator.storage.persist()`). Browsers decide whether to grant that request. IndexedDB data survives ordinary reloads and connection loss, but no web app can guarantee retention if the user clears site data, uninstalls the app, resets the device, or the browser/OS evicts storage. Large playlists can use substantial device storage; remove downloads when they are no longer needed.

Only download and retain audio that you have the rights and permission to store offline, and ensure the upstream provider and applicable platform terms allow the requested use.
