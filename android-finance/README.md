# Private Finance: offline Android app

Version 2.0 bundles the existing finance interface inside the APK. It opens directly, stores records on the phone, uses UZS only, and has no sign-in, PIN, exchange-rate requests, or Internet permission. Android System WebView renders the interface; Chrome and the website are not needed.

## Move website records to the phone

1. Commit/push and deploy the website changes in this repository first. These add the **Backups** tab and `/api/private-finance/backup` export endpoint. Keep the existing `PRIVATE_FINANCE_USER_ID` and Supabase configuration.
2. On the phone, open `https://eshtaylakov.uz/x97-private-portal`, select **Backups → Export all data**, and keep the downloaded JSON. Avoid changing records during export because tables are read separately. It includes all months, archived accounts/categories, transactions, transfers, budgets, debts, and repayments.
3. Install `Private-Finance-Offline-v2.0.apk` over the previous app. It uses the same package and signing key. Never uninstall an offline version containing records without exporting first.
4. Open **Backups → Import / restore**, select the JSON, review counts, and tap **Replace data & restore**. Import replaces local records rather than merging. The previous local snapshot remains available through **Review records from before last restore**.
5. Check balances, old transactions, debts, and budgets. Keep the original export separately. Website records remain intact; subsequent phone edits stay local and do not sync to the website.
6. Select a writable backup folder such as `Documents/QuietMoney` in Android's folder picker and grant access. Check that the first backup succeeds.

Existing USD records convert once during import. Transactions use saved historical rates; other USD records use the conversion rate saved in the website export. Opening-balance adjustments preserve exported account balances in UZS. Original USD amounts and conversion metadata remain in backups for reference. UZS-only backups are not converted again.

## Saving and backups

Changes save immediately to an atomic JSON file in app-private storage. Restore validates data and keeps a recovery snapshot before replacing it. **Export all data** writes a complete JSON wherever Android's save picker allows. **Import / restore** accepts website exports or app backups.

The selected folder receives `quiet-money-auto-YYYY-MM-DD.json` daily. Android can delay background work; opening the app also checks whether a backup is due. The latest 30 automatic daily copies are retained; unrelated files are left alone. **Back up now** refreshes today's copy. The panel shows the last successful backup and errors; choose another folder if access is lost.

A folder on the same phone does not survive phone loss. Periodically copy an export elsewhere. JSON backups are not encrypted. Uninstalling clears private records and the recovery snapshot. Export first and keep the local signing key for future updates.

## Build and verification

Requires Node.js dependencies (`npm ci`), Java 17, Android SDK 36, and build tools 35.0.0 or newer. Set `ANDROID_HOME` or an ignored `local.properties` with `sdk.dir`.

The existing ignored `.signing/finance-debug.keystore` signs updates. Keep it; never replace an existing key or commit it. For a first build only, create an RSA 2048 key using alias `androiddebugkey` and store/key password `android`. This is a signed personal/debug APK for sideloading.

From `android-finance/`, run:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug lintDebug --console=plain
```

Gradle bundles the React interface automatically. Output: `app/build/outputs/apk/debug/app-debug.apk`. Install through the phone's file manager.

From the repository root, run `node --test tests/offline-finance.test.mjs tests/private-finance.test.mjs` and `npm run test:finance-browser`. Android startup/storage tests use Robolectric on Android 9. These checks do not replace testing startup, document pickers, and background backups on the Redmi. The offline APK needs no website asset-link association.
