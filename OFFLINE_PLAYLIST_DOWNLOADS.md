# Offline playlist downloads

Melodiya stores complete playlist audio files as Blobs in the browser's IndexedDB database `melodiya_offline_library`, object store `offline_tracks`.

## How it works

- Downloads are initiated from a playlist detail page with **Download Playlist for Offline**. Downloads are playlist-level; individual-track download actions are intentionally not exposed.
- Each track is fetched from the serverless audio API (`/api/youtube-audio?id=<video-id>&stream=1`) and saved as a Blob with title, artist, duration, artwork, playlist ID, track ID, MIME type, and playback position. The downloader falls back to resolving metadata and trying available stream/proxy URLs when the binary proxy request fails.
- A playlist is marked complete only after every track has been fetched and stored. Failed downloads are rolled back instead of being shown as complete. The error now reports the API host or stream host that failed; it is not proof that the app can reach the upstream service.
- When offline, the app switches to **Offline Library** and reads saved Blobs from IndexedDB. Browser/PWA playback uses a temporary object URL. The Flutter Android APK transfers the saved Blob to a temporary app file and plays it with the native audio service.
- **Remove Offline Download** deletes all records for that playlist. Settings also includes a clear-all action.

## Required API deployment

The `api/youtube-audio.ts` route is a Vercel serverless function. A static frontend host such as a static PWA deployment does not automatically run this backend route. Deploy the `api/` function to Vercel (or another compatible serverless host) and set the frontend build variable to the full deployed endpoint:

```env
VITE_YTMUSIC_AUDIO_API_URL=https://your-api-deployment.vercel.app/api/youtube-audio
```

Set this in the frontend host's environment settings, then rebuild/redeploy the frontend. The app tries the configured URL, the repository's legacy Vercel endpoint, and a same-origin `/api/youtube-audio` fallback. The same-origin fallback works only if the frontend's host also serves the API route. The serverless function also needs access to upstream audio resolver instances; configure `YOUTUBE_AUDIO_PIPED_INSTANCES` on the API host for a stable resolver pool. Public resolver instances can be rate-limited, moved, or unavailable.

**Important:** The PWA's IndexedDB and the Flutter WebView's IndexedDB are separate browser storage areas. Download a playlist inside the same app installation where you intend to use it offline. A playlist downloaded in Chrome/PWA will not automatically appear in the Flutter APK, and vice versa.

## Storage limits

The app requests persistent browser storage before downloading (`navigator.storage.persist()`), but the browser decides whether to grant it. IndexedDB data normally survives reloads and loss of connectivity; it is not guaranteed to survive clearing site data, uninstalling the app, device resets, or browser/OS storage eviction. Large playlists can use substantial device storage. Remove downloads when no longer needed.

Only download and retain audio where you have the rights and permission to store it offline, and comply with the relevant provider/platform terms.
