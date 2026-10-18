# BK Admin (Capacitor) — opens https://buyukkaravan.com/admin

1. `cd mobile && npm ci && npx cap sync` — after a dependency or `capacitor.config.ts` change (site changes need no rebuild).
2. Signing: `mobile/android/keystore.properties` (not in git) — `storeFile=G:/BK-keys/bk-admin-upload.jks`, `storePassword=…`, `keyAlias=upload`, `keyPassword=…`.
3. Play Market AAB: `cd mobile/android && gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
4. Test APK: `cd mobile/android && gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` (needs JDK 21 + Android SDK).
5. CI: push a tag `android-v1.0.0` → GitHub Actions "Android release" builds both (artifact `bk-admin-android`); icons: `npm run assets`.
