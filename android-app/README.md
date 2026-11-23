# BEE-OAK Android app (Play Store)

Cordova shell that bundles the website in `../web` (hash routes, live API `https://vybera.onrender.com`).
Ships as `com.blaktickets.app`, signed with the existing upload key (kept outside the repo).

    ./build-play.sh <versionName> <versionCode>    # e.g. ./build-play.sh 1.0.1 10040

Needs JDK 21 (Android Studio JBR) and the Android SDK. Signing config is read from
`../beeoak-signing/build-vybera.json` (not committed). Bump versionCode on every Play upload.
