# YouTube Music audio playback

Melodiya's official YouTube Music catalogue tracks now use an audio-only HTML media element instead of the YouTube IFrame player. Tracks from other sources continue to use the existing player paths.

## API

`GET /api/youtube-audio?id=<11-character-video-id>` resolves the best available audio-only M4A or WebM stream and returns JSON containing the provider URL, MIME type, bitrate, quality, and a `streamUrl`. Piped CDN proxy URLs are returned directly because they already support CORS and byte-range requests; this avoids holding a serverless function open for an entire song. If an instance returns a raw Google Video URL, `streamUrl` points to the local proxy instead.

`GET /api/youtube-audio?id=<video-id>&stream=1` is the header-aware fallback proxy. It forwards byte-range requests and adds the expected User-Agent, YouTube Referer, and Origin headers upstream, then returns the audio response with `Accept-Ranges`, `Content-Range`, `Content-Length` (when supplied), and the audio MIME type. Its maximum stream duration is governed by the serverless host's function-duration limit, so the default instance list prioritizes Piped instances with CDN proxy support.

The endpoint accepts `videoId` as an alias for `id`, and also supports `HEAD` and `OPTIONS` requests. It validates the 11-character video ID and applies a best-effort per-IP request limit on warm serverless instances.

## Configuration

- `VITE_YTMUSIC_AUDIO_API_URL`: optional browser-visible API URL. Defaults to the existing `https://melodiya-your-sound.vercel.app/api/youtube-audio` API deployment; set it to `/api/youtube-audio` when serving the frontend and function from the same origin.
- `YOUTUBE_AUDIO_PIPED_INSTANCES`: optional comma-separated list of Piped API base URLs for server-side stream resolution. Defaults to a short list of public instances with CDN proxy support. Public instances are community-operated and can be unavailable or rate limited; configure an instance you operate for production reliability.

## Player integration

The existing YouTube Music search normalizer marks trusted catalogue responses with `source: "youtube_music"`. `MusicPlayer` uses `useYoutubeAudio` only for those tracks, retains the native-player bridge when a native audio URL is already provided, and continues to use the iframe player for other tracks. The Media Session API publishes title, artist, YouTube Music album metadata, and thumbnail artwork. Play, pause, previous, next, seek, and stop actions call the latest callbacks owned by `MelodiyaApp`, which is the current app-wide playback state owner.

Piped's `/streams/:videoId` response documents the `audioStreams` array and audio MIME/format/URL fields used by the API route: https://docs.piped.video/docs/api-documentation/.
