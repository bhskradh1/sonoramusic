# YouTube Music search provider

Melodiya uses an authenticated, metadata-only search endpoint at
`/api/ytmusic-search`. It is restricted to YouTube Music's artist/catalogue
**Songs** results. It never queries the general **Videos** category and never
falls back to YouTube Data API video search.

The ytmusicapi documentation distinguishes:
- `songs`: actual catalogue songs uploaded by artists.
- `videos`: regular YouTube videos that may be uploaded by any user.

## Official-music filtering

The endpoint admits only results that:
- Have `resultType = song`.
- Have a linked artist channel in the YouTube Music Songs catalogue. When `videoType` is present, allow only `MUSIC_VIDEO_TYPE_ATV` (artist audio track) or `MUSIC_VIDEO_TYPE_OMV` (original artist music video); reject `UGC` and other explicit types. The field can be absent on valid Songs catalogue rows, so absence alone is not grounds to reject.
- Have a valid video ID and a named artist linked to a YouTube channel ID.
- Are available according to YouTube Music catalogue metadata.
- Are no longer than 15 minutes.
- Do not look like jukebox collections, non-stop lists, medleys, mashups,
  compilations, merged songs, full-album uploads, karaoke, cover/tribute
  uploads, slowed/nightcore/sped-up edits or DJ-style mixes.

This is a strict artist/catalogue filter, not a manual verification of every
underlying uploader. YouTube Music does not expose a universally reliable
"official uploader" boolean for every individual result. Some legitimate
releases are delivered through auto-generated artist Topic/catalogue channels.

## Runtime configuration

Vercel environment variables:
- `MUSIC_SUPABASE_URL`: the Melodiya Supabase project URL.
- `MUSIC_SUPABASE_ANON_KEY`: the Melodiya Supabase publishable/anon key,
  stored as a sensitive environment variable.

The endpoint verifies the supplied access token against Supabase Auth and
does not trust a caller-provided user ID.

## Search behaviour

- Searches artist/catalogue songs only; no general YouTube video search.
- Returns up to 20 approved tracks per request.
- Uses a 15-minute in-memory cache on warm serverless instances and a 15-minute local cache in the app.
- Sends one small catalogue request for a new query, reuses cached and in-flight results, and applies a best-effort limit of 30 searches per signed-in user per minute per
  warm instance. Serverless instances can be recycled or scaled, so this is not
  a globally persistent quota.
- Search, personalized recommendations and weekly trending share the same
  strict provider. A provider failure is shown as an error rather than silently
  switching to unrestricted user-uploaded videos.

The YouTube Music interface is unofficial and can be throttled or changed by
YouTube. This is not a guarantee of unlimited searches. Search returns
metadata/video IDs only; playback stays on Melodiya's existing player.
