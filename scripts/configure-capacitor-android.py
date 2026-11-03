#!/usr/bin/env python3
"""Configure the generated Capacitor Android project for a signed Sonora APK."""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "android"
APP = ANDROID / "app"
PACKAGE_ID = "com.melodiya.melodiya_app"
APP_NAME = "Sonora"


def replace_once(pattern: str, replacement: str, content: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Could not configure {label}; expected one matching Gradle setting.")
    return updated


def main() -> None:
    if not ANDROID.is_dir() or not APP.is_dir():
        raise SystemExit("Capacitor Android project was not generated. Run 'npx cap add android' first.")

    gradle = APP / "build.gradle"
    if not gradle.exists():
        raise SystemExit("Expected Capacitor's Groovy Android app/build.gradle was not generated.")

    version_code = os.environ.get("ANDROID_VERSION_CODE", "").strip()
    version_name = os.environ.get("APP_VERSION", "1.0.0").strip()
    if not version_code.isdigit() or int(version_code) < 1:
        raise SystemExit("ANDROID_VERSION_CODE must be a positive integer.")

    content = gradle.read_text(encoding="utf-8")
    content = replace_once(
        r"namespace\s*=\s*['\"][^'\"]+['\"]",
        f'namespace = "{PACKAGE_ID}"',
        content,
        "Android namespace",
    )
    content = replace_once(
        r'applicationId\s+["\'][^"\']+["\']',
        f'applicationId "{PACKAGE_ID}"',
        content,
        "Android application ID",
    )
    content = replace_once(
        r"versionCode\s+\d+",
        f"versionCode {int(version_code)}",
        content,
        "Android version code",
    )
    content = replace_once(
        r'versionName\s+["\'][^"\']+["\']',
        f'versionName "{version_name}"',
        content,
        "Android version name",
    )

    if "signingConfigs {" not in content:
        signing = """
    signingConfigs {
        release {
            storeFile file("melodiya-upload-key.p12")
            storePassword System.getenv("ANDROID_STORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }

"""
        content = replace_once(r"android\s*\{", "android {\n" + signing, content, "release signing config")

    release_match = re.search(r"buildTypes\s*\{\s*release\s*\{", content)
    if not release_match:
        raise SystemExit("Could not find the Capacitor release build type.")
    release_body_start = release_match.end()
    if "signingConfig signingConfigs.release" not in content[release_body_start:release_body_start + 500]:
        content = content[:release_body_start] + "\n            signingConfig signingConfigs.release" + content[release_body_start:]

    gradle.write_text(content, encoding="utf-8")

    strings_file = APP / "src/main/res/values/strings.xml"
    if strings_file.exists():
        strings = strings_file.read_text(encoding="utf-8")
        strings, count = re.subn(
            r"<string\s+name=['\"]app_name['\"]>.*?</string>",
            '<string name="app_name">Sonora</string>',
            strings,
            count=1,
            flags=re.DOTALL,
        )
        if count == 0:
            strings = strings.replace("</resources>", '    <string name="app_name">Sonora</string>\n</resources>')
        strings_file.write_text(strings, encoding="utf-8")

    manifest = APP / "src/main/AndroidManifest.xml"
    if not manifest.exists():
        raise SystemExit("Capacitor AndroidManifest.xml was not generated.")
    xml = manifest.read_text(encoding="utf-8")
    for permission in ("android.permission.INTERNET", "android.permission.POST_NOTIFICATIONS"):
        permission_line = f'    <uses-permission android:name="{permission}" />'
        if f'android:name="{permission}"' not in xml:
            xml = xml.replace("<application", permission_line + "\n\n    <application", 1)
    manifest.write_text(xml, encoding="utf-8")

    icon = ROOT / "public/icon-512x512.png"
    if not icon.exists():
        icon = ROOT / "public/icon-192x192.png"
    if not icon.exists():
        raise SystemExit("Melodiya launcher icon was not found in public/.")
    res = APP / "src/main/res"
    for density in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
        target = res / f"mipmap-{density}"
        target.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(icon, target / "ic_launcher.png")
        shutil.copyfile(icon, target / "ic_launcher_round.png")
    adaptive = res / "mipmap-anydpi-v26"
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        candidate = adaptive / name
        if candidate.exists():
            candidate.unlink()

    print(f"Configured {APP_NAME} ({PACKAGE_ID}), versionCode={version_code}, versionName={version_name}.")


if __name__ == "__main__":
    main()
