# Sonora playback and offline-download patch

## Included changes

- Added a Flutter Android build workflow that creates a debug APK artifact from the current web app.
- Routed YouTube Music online streams and IndexedDB offline playlist Blobs through the Flutter `just_audio` player when the app is running in the Flutter Android wrapper.
- Kept browser/PWA playback on HTML audio; Android Chrome still controls whether a PWA can continue in the background.
- Removed the Flutter audio handler's foreground-only guards so notification/lock-screen play, pause, previous, and next controls remain registered while the Android app is backgrounded.
- Published track metadata to the Android `audio_service` notification and synchronized its playback position.
- Improved offline download API fallback and error reporting. The app now tries the configured API, the legacy Vercel API, and a same-origin API route where applicable.
- Added `.env.example` and updated deployment instructions for `VITE_YTMUSIC_AUDIO_API_URL`.

## What still requires deployment/device verification

1. Deploy `api/youtube-audio.ts` to a Vercel-compatible serverless host. Configure `VITE_YTMUSIC_AUDIO_API_URL` in the frontend host and rebuild the frontend. A static frontend host alone does not run the `api/` function.
2. Build and install the Flutter APK from **Actions → Build Sonora Flutter Android APK**. The PWA and existing Capacitor APK do not include the Flutter native audio service.
3. Download the playlist inside the same app installation where it will be used offline. The Chrome/PWA and Flutter WebView IndexedDB stores are isolated from one another.

The source was syntax-checked for the changed TypeScript files and shell/YAML workflow files. A full npm build and Flutter APK build were not run in this environment because the project dependencies could not be installed here and the Flutter SDK is unavailable. Real Android background playback and the deployed API still need testing on a device after deployment.
