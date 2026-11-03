#!/usr/bin/env python3
"""Configure the generated Flutter Android Gradle project for release signing."""
from pathlib import Path
import re
import sys

app_dir = Path(__file__).resolve().parents[1] / "flutter_app" / "android" / "app"
kts = app_dir / "build.gradle.kts"
groovy = app_dir / "build.gradle"

if kts.exists():
    gradle = kts
    text = gradle.read_text()
    imports = "import java.io.FileInputStream\nimport java.util.Properties\n\n"
    if "val keystorePropertiesFile" not in text:
        if not text.startswith("import "):
            text = imports + text
        elif "import java.io.FileInputStream" not in text:
            text = imports + text
        loader = """\nval keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

"""
        if "android {" not in text:
            raise SystemExit("Could not find the android { block in build.gradle.kts")
        text = text.replace("android {", loader + "android {", 1)
    signing = """    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
            storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
        }
    }

"""
    if 'create("release")' not in text:
        text = text.replace("android {", "android {\n" + signing, 1)
    text, count = re.subn(
        r'signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)',
        'signingConfig = signingConfigs.getByName("release")',
        text,
        count=1,
    )
    if count == 0 and 'signingConfig = signingConfigs.getByName("release")' not in text:
        raise SystemExit("Could not find the generated release signingConfig in build.gradle.kts")
else:
    gradle = groovy
    if not gradle.exists():
        raise SystemExit("Flutter app Gradle file not found; run prepare-flutter-android.sh first.")
    text = gradle.read_text()
    imports = "import java.io.FileInputStream\nimport java.util.Properties\n\n"
    if "def keystorePropertiesFile" not in text:
        if not text.startswith("import "):
            text = imports + text
        elif "import java.io.FileInputStream" not in text:
            text = imports + text
        loader = """\ndef keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

"""
        if "android {" not in text:
            raise SystemExit("Could not find the android { block in build.gradle")
        text = text.replace("android {", loader + "android {", 1)
    signing = """    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile rootProject.file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }

"""
    if "signingConfigs {" not in text:
        text = text.replace("android {", "android {\n" + signing, 1)
    text, count = re.subn(
        r'signingConfig\s+signingConfigs\.debug',
        'signingConfig signingConfigs.release',
        text,
        count=1,
    )
    if count == 0 and "signingConfig signingConfigs.release" not in text:
        raise SystemExit("Could not find the generated release signingConfig in build.gradle")

gradle.write_text(text)
print(f"Release signing configured in {gradle}")
