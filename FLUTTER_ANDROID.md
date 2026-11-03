# Sonora — Flutter Android app

The React/Vite application remains the source of truth. The Flutter Android wrapper packages that same web UI inside a native Android app and provides native background audio through `just_audio` and `audio_service`.

## Which install should be used?

- **Installed PWA / Chrome website:** uses browser-managed HTML audio. Background playback may work on some Android/browser combinations, but the app cannot force Android to keep a browser tab alive.
- **Flutter Android APK:** uses Android's native media playback service for YouTube Music streams and downloaded playlist audio. This is the recommended install for lock-screen playback and notification controls.
- **Capacitor APK:** does not include this Flutter native audio bridge. Use the Flutter build for background playback.

## Build an APK with GitHub Actions

1. Push the updated repository to GitHub.
2. Open **Actions → Build Sonora Flutter Android APK**.
3. Select **Run workflow**.
4. When the workflow completes, download the `sonora-flutter-android-apk` artifact.
5. Extract and install `app-debug.apk` on the Android device.

This workflow creates a debug-signed APK, so it does not require an Android signing keystore. It is suitable for device testing. A release APK should be built and signed with your production keystore before public distribution.

## Local build

Requirements: Node.js 22+, Java 17+, Flutter stable, and the Android SDK.

```bash
npm ci
npm run build
bash scripts/prepare-flutter-android.sh
cd flutter_app
flutter pub get
flutter build apk --debug
```

APK output: `flutter_app/build/app/outputs/flutter-apk/app-debug.apk`.

## Background playback behavior

- Online YouTube Music tracks are resolved by the server API, then handed to the Flutter `just_audio` player.
- Tracks saved by the playlist offline downloader remain stored in the WebView's IndexedDB. When an offline track is selected in the Flutter APK, its Blob is copied to a temporary app file and played by the same native audio player. IndexedDB is isolated per browser origin, so download the playlist inside the Flutter APK itself; Chrome/PWA downloads do not automatically transfer into the APK.
- `audio_service` publishes Android media metadata and notification/lock-screen controls. Play and pause are handled by the native player even when WebView JavaScript is suspended. Previous/next are forwarded to the app's playback queue.
- Start playback while the app is visible first. Android may restrict starting new background playback without a foreground user action.

The web/PWA build still uses HTML audio and cannot guarantee uninterrupted background playback. Android battery optimization, force-stop, and user-disabled notification permissions can also interrupt or hide system media controls.

## Authentication and online features

The Flutter wrapper bundles the Vite build locally. Supabase authentication, search, playlist metadata, and online audio resolution still require internet access. Configure the same public Supabase URL/key and `VITE_YTMUSIC_AUDIO_API_URL` used by the web deployment before building when those variables are required by your deployment.

Only public Supabase client credentials belong in frontend builds. Never include a service-role key or other private credentials.

## Audio source and permissions

The app uses public stream resolvers and should only download or retain audio where you have the necessary rights and permission. Confirm that your use complies with the relevant platform and provider terms. Public resolver instances can be rate-limited or unavailable; for reliable production operation, use an audio API you operate and control.
