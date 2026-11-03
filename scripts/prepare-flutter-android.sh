#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/flutter_app"
cd "$ROOT_DIR"

if [[ ! -d dist ]]; then
  npm run build
fi

mkdir -p "$APP_DIR/assets/web"
find "$APP_DIR/assets/web" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R dist/. "$APP_DIR/assets/web/"

# Generate the Android runner only in the build workspace. The Flutter source
# is versioned; platform boilerplate is created reproducibly by Flutter stable.
if [[ ! -d "$APP_DIR/android" ]]; then
  (cd "$APP_DIR" && flutter create --platforms=android --project-name melodiya_app --org com.melodiya --no-pub .)
fi

python3 scripts/configure-android-signing.py

python3 - <<'PY'
from pathlib import Path
import re
import shutil

manifest = Path('flutter_app/android/app/src/main/AndroidManifest.xml')
if not manifest.exists():
    raise SystemExit('Flutter Android manifest was not generated.')

text = manifest.read_text()
permissions = [
    'android.permission.INTERNET',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.WAKE_LOCK',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.REQUEST_INSTALL_PACKAGES',
]
for permission in permissions:
    token = f'android:name="{permission}"'
    if token not in text:
        text = text.replace(
            '<application',
            f'    <uses-permission android:name="{permission}" />\n\n    <application',
            1,
        )

text = re.sub(r'android:label="[^"]*"', 'android:label="Sonora"', text, count=1)
if 'android:usesCleartextTraffic=' not in text:
    text = text.replace(
        'android:name="${applicationName}"',
        'android:name="${applicationName}" android:usesCleartextTraffic="true"',
        1,
    )

text, activity_count = re.subn(
    r'android:name="(?:\.MainActivity|[A-Za-z0-9_.$]*MainActivity)"',
    'android:name="com.ryanheise.audioservice.AudioServiceActivity"',
    text,
    count=1,
)
if activity_count == 0 and 'android:name="com.ryanheise.audioservice.AudioServiceActivity"' not in text:
    raise SystemExit('Could not find the generated Android main activity in AndroidManifest.xml.')

audio_components = """
        <service
            android:name="com.ryanheise.audioservice.AudioService"
            android:foregroundServiceType="mediaPlayback"
            android:exported="true">
            <intent-filter>
                <action android:name="android.media.browse.MediaBrowserService" />
            </intent-filter>
        </service>
        <receiver
            android:name="com.ryanheise.audioservice.MediaButtonReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MEDIA_BUTTON" />
            </intent-filter>
        </receiver>
"""
if 'android:name="com.ryanheise.audioservice.AudioService"' not in text:
    text = text.replace('</application>', audio_components + '    </application>', 1)
manifest.write_text(text)

# Use the same mark as the website for the Android launcher icon.
icon_source = Path('flutter_app/assets/web/icon-512x512.png')
if not icon_source.exists():
    icon_source = Path('flutter_app/assets/web/icon-192x192.png')
if not icon_source.exists():
    raise SystemExit('The Melodiya web icon was not found in the bundled assets.')
res_dir = Path('flutter_app/android/app/src/main/res')
for density in ('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'):
    mipmap = res_dir / ('mipmap-' + density)
    mipmap.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(icon_source, mipmap / 'ic_launcher.png')
    shutil.copyfile(icon_source, mipmap / 'ic_launcher_round.png')
# Remove generated adaptive-icon references so Android consistently uses
# the actual web-app mark supplied above on supported launchers.
for adaptive_name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    adaptive = res_dir / 'mipmap-anydpi-v26' / adaptive_name
    if adaptive.exists():
        adaptive.unlink()

for name in ('build.gradle.kts', 'build.gradle'):
    gradle = Path('flutter_app/android/app') / name
    if not gradle.exists():
        continue
    value = gradle.read_text()
    value = value.replace('minSdk = flutter.minSdkVersion', 'minSdk = 24')
    value = value.replace('minSdkVersion flutter.minSdkVersion', 'minSdkVersion 24')
    gradle.write_text(value)
PY

echo "Android project prepared in $APP_DIR"
