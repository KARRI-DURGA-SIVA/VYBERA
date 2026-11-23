#!/bin/bash
# Build the Play Store bundle: bundles the website (hash routes, live API) and signs with the upload key.
# Usage: ./build-play.sh <versionName> <versionCode>      e.g. ./build-play.sh 1.0.1 2
set -euo pipefail
VER="${1:?version name, e.g. 1.0.1}"; CODE="${2:?version code, e.g. 2}"
HERE="$(cd "$(dirname "$0")" && pwd)"; WEB="$HERE/../beeoak-web"; [ -d "$WEB" ] || WEB="$HERE/../web";  # Mac workspace or repo layout
 KEY="$HERE/../beeoak-signing/build-vybera.json"  # Play listing expects the existing vybera-upload key
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk"
( cd "$WEB" && VITE_ROUTER=hash VITE_API_BASE=https://vybera.onrender.com VITE_WRITE_MODE=live npx vite build --outDir dist-app --emptyOutDir )
rm -rf "$HERE/www" && cp -R "$WEB/dist-app" "$HERE/www"
# Load Cordova's bridge (status bar tint, geolocation plugin) in the bundled app.
sed -i '' 's#<head>#<head><script src="cordova.js"></script>#' "$HERE/www/index.html"
sed -i '' -E "s/version=\"[^\"]+\" android-versionCode=\"[0-9]+\"/version=\"$VER\" android-versionCode=\"$CODE\"/" "$HERE/config.xml"
CORDOVA="$HERE/../VYBERA/node_modules/.bin/cordova"; [ -x "$CORDOVA" ] || CORDOVA="$HERE/../node_modules/.bin/cordova"
cd "$HERE" && "$CORDOVA" build android --release --buildConfig="$KEY"
cp platforms/android/app/build/outputs/bundle/release/app-release.aab "$HERE/BEE-OAK-v$VER-code$CODE.aab"
echo "Bundle: $HERE/BEE-OAK-v$VER-code$CODE.aab"
