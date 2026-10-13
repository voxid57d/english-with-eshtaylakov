# Private Finance for Android

This Android app opens `https://eshtaylakov.uz/x97-private-portal` directly using
Google's Trusted Web Activity library. The finance link opens without sign-in,
PIN, or an app lock. Anyone with the URL can view and change the finance records.

Version 1.1 uses a native launch screen, prefers enabled Chrome, and offers
**Open in browser** if the fullscreen handoff fails or stalls. If no browser is
available, the app displays an instruction instead of closing. Incoming links
always open the fixed finance URL. Version 1.1 uses the same signing key as 1.0,
so install the updated APK over the previous version without uninstalling.

Deploy the website's open-access finance changes to remove its account check.
The existing APK then opens finance directly without rebuilding. Internet
access and an up-to-date browser supporting Custom Tabs are required. Website
changes appear in the app without rebuilding the APK.

## Build and install

Requires Java 17 and Android SDK 36 with build tools 35.0.0 or newer.

1. Set `ANDROID_HOME` to your Android SDK directory, or put its path in the ignored
   `local.properties` as `sdk.dir=C\:/Users/your-user/AppData/Local/Android/Sdk`.
2. Create the local signing key once (keep it for future updates):

   ```powershell
   New-Item -ItemType Directory -Force .signing
   keytool -genkeypair -keystore .signing/finance-debug.keystore -storepass android -keypass android -alias androiddebugkey -dname "CN=Private Finance Android" -keyalg RSA -keysize 2048 -validity 10000
   ```

3. Run `./gradlew testDebugUnitTest assembleDebug lintDebug` (Windows: `./gradlew.bat`).
4. Transfer `app/build/outputs/apk/debug/app-debug.apk` to your Android phone and
   install it, allowing installation from the file manager if Android asks.
5. Open **Private Finance** and verify that finance loads without signing in.

This is a signed personal/debug APK for sideloading, not a Play Store release.
It contains no Google credentials or Supabase service key.
Do not commit or share `.signing/finance-debug.keystore`; retain it locally to
install future APK updates over this version. Losing it requires uninstalling the
old APK before installing a build with a new key.

## Fullscreen website association

Deploy the generated `public/.well-known/assetlinks.json` with the Next.js site.
It must be publicly served at
`https://eshtaylakov.uz/.well-known/assetlinks.json` with HTTP 200, JSON content
type, and no redirect. The fingerprint must match the installed APK's certificate:

```powershell
keytool -list -v -keystore .signing/finance-debug.keystore -storepass android -alias androiddebugkey
```

Until that file is deployed and verified by the browser, the app still opens the
finance page but shows the browser toolbar. External Google authentication pages
also show browser controls. The association is for fullscreen display/link
handling only; it does not authorize access to finance records.

## Validation on a phone

Startup simulation tests cover Android 9, including no browser and a
simulated startup exception with Chrome fallback. These do not replace testing
the actual browser handoff and Google sign-in on the phone.

- Opening the icon lands on finance, not the English/staff dashboard.
- Finance opens when signed out of the website.
- Closing and reopening loads finance with no account or PIN prompt.
- Creating/editing finance entries works as it does on the website.
- Back closes the app or follows browser history normally.
- Confirm the toolbar disappears after the website association is deployed.

References: [Google's integration guide](https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide)
and [Google's OAuth WebView guidance](https://support.google.com/faqs/answer/12284343).
