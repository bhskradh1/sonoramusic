# Melodiya — Flutter Android APK

This repository remains the source of truth for the existing React/Vite web app. The Flutter Android shell packages the built web app into an installable Android APK; existing React screens and Supabase operations are reused rather than reimplemented.

## Build the APK with GitHub Actions

1. Open **Actions** in this repository.
2. Select **Build Melodiya Android APK**.
3. Click **Run workflow** and choose the `feat/flutter-android-apk` branch for a test build (or merge this branch into `main) to enable builds on main).
4. When the job succeeds, open the workflow run and download the `melodiya-android-apk` artifact.
5. Extract the artifact and install `app-release.apk` on an Android device.

The workflow installs Node.js, Java, and Flutter; builds the React app; copies the Vite output into the Flutter assets; generates Android project files; and builds a release APK. It does not require committing generated web assets or the generated Android Gradle project.

## Local build

Requirements: Node.js 22+, Java 17, Flutter stable and Android SDK.

```bash
npm ci
npm run build
bash scripts/prepare-flutter-android.sh
cd flutter_app
flutter pub get
flutter build apk --release
```

APK output: `flutter_app/build/app/outputs/flutter-apk/app-release.apk`.

## Authentication redirect

The build uses `MELODIYA_AUTH_REDIRECT_URL` if configured as a GitHub Actions repository variable, otherwise it defaults to the public deployment `https://melodiya-your-sound.vercel.app/`. Ensure this exact URL is allowed in Supabase **Authentication → URL Configuration → Redirect URLs**. The existing signup flow redirects to the current page origin.

## Notes

- The bundled UI launches locally, but Supabase authentication, database calls, and YouTube features still require internet access.
- Only the public Supabase anon/publishable key belongs in client code. Never add a Supabase service-role key or other private credentials to this repository.
- The wrapper supports WebView JavaScript, Android system back navigation, and opening external links in their associated Android apps.
- Native playback uses `just_audio` + `just_audio_background`, with an Android media playback service, media notification, and lock-screen/headset controls. The React player uses this path when a track includes `audioUrl` (or `audio_url`) containing a direct, accessible HTTPS audio stream URL.
- The existing discovery/search catalog returns YouTube video IDs only, which are not audio stream URLs. YouTube playback stays in the embedded YouTube player and is not routed through the native audio player. Do not extract or separate YouTube audio. Native background playback requires licensed audio files/streams to be made available to the app.
- Test direct-stream background playback on a physical Android device, including screen lock, notification play/pause, seeking, and network interruptions.
- This branch adds the Android packaging path without deleting or replacing the existing web app.
