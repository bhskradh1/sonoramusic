# YouTube Music audio playback

Melodiya resolves audio-only streams through the serverless `api/youtube-audio.ts` endpoint. The React player uses HTML audio in normal browsers and hands the resolved HTTPS stream to the Flutter Android native player when it detects the Flutter JavaScript bridge. Other music sources keep their existing playback paths.

## API deployment

`GET /api/youtube-audio?id=<11-character-video-id>` resolves an audio-only M4A or WebM stream and returns JSON containing the selected provider URL, MIME type, bitrate, quality, and `streamUrl`. `GET /api/youtube-audio?id=<video-id>&stream=1` is the header-aware binary proxy fallback. It forwards byte-range requests and returns audio headers. The route is written as a Vercel serverless function; deploying only the static Vite frontend does not deploy this API.

Set `VITE_YTMUSIC_AUDIO_API_URL` to the absolute URL of the deployed API route when the frontend is hosted separately, for example:

```env
VITE_YTMUSIC_AUDIO_API_URL=https://your-api-deployment.vercel.app/api/youtube-audio
```

This is a Vite build-time variable: set it in the frontend host's environment settings and rebuild/redeploy the frontend. The app tries this configured endpoint first, then the repository's legacy Vercel endpoint, then a same-origin `/api/youtube-audio` fallback. A same-origin fallback only works when the frontend host also serves the API route.

`YOUTUBE_AUDIO_PIPED_INSTANCES` is a server-side environment variable containing comma-separated Piped API base URLs. The API defaults to a small list of public instances, which may become rate-limited or unavailable; for production reliability use an instance you operate and control.

## Browser playback vs Android background playback

- Chrome and installed PWAs use an HTML audio element and the browser Media Session API. This is best-effort background playback; Android may suspend a browser/PWA process and a web page cannot force a foreground media service to run.
- The Flutter Android APK routes YouTube Music online audio and saved offline audio through `just_audio` and `audio_service`. The native service owns the Android media notification and lock-screen metadata/controls, so playback can continue while the WebView is backgrounded. Use the Flutter APK workflow described in `FLUTTER_ANDROID.md`; the Capacitor APK does not include this Flutter bridge.
- Start playback while the Flutter app is visible. Android can prevent an app from starting new background playback without a user-initiated foreground start. Battery restrictions, force-stop, or denied notification permissions can still affect the experience.

## Player metadata and controls

The web player publishes title, artist, album (`YouTube Music`), and thumbnail artwork to the browser Media Session. In the Flutter APK it also sends the same metadata to `audio_service`, which exposes play/pause/previous/next controls. Native play/pause commands operate directly on the native audio player; next/previous are forwarded to the app's playback queue.

Piped's `/streams/:videoId` response documents the `audioStreams` array and the audio MIME/format/URL fields consumed by the API: https://docs.piped.video/docs/api-documentation/.

Only stream or retain audio where you have the necessary rights and permission, and comply with the relevant provider/platform terms.
