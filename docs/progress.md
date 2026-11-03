# Progress checkpoint — 3 November 2026

## Saved work

- Private student and teacher accounts; the existing web workspace is protected as the admin panel.
- Student notes, study-material uploads, personal practice tests, results, and activity history.
- Accepted study mates, photo-based three-question quizzes, explicit sharing, and shared streaks.
- Android camera-first app, separate student mobile API, local APK build tooling, and native device checks.
- Native preview layout and system-bar contrast fixes, plus sign-out when restarting with the backend offline.

The internal APK is available locally at `artifacts/MockTaste-android-preview.apk`. Build tools, APKs, account data, AI credentials, dependencies, and generated native projects are ignored by Git. See [Android verification](android-verification.md) for the passing emulator workflow, screenshots, checksum, and verification limits.

## Resume here

1. Install the APK on the physical Android phone and use the same Wi-Fi as the desktop backend. Check actual camera quality and the phone-to-backend connection.
2. Connect ChatGPT from the desktop student workspace with that same account, then exercise real photo extraction and question generation. Automated device checks use deterministic AI fixtures.
3. Define the teacher workflow before implementing classroom features. Public hosting, direct mobile AI authorization, and store publication remain separate decisions.

Start the desktop/mobile backend from the repository root, replacing the address if Wi-Fi has changed:

```bash
rtk npm run dev:mobile -- --mobile-origin http://10.17.71.1:4175 --mobile-bind 0.0.0.0
```

The desktop browser interface is `http://127.0.0.1:4173`. Port 4175 is entered in the Android app's **Workspace address** field. It serves an API rather than the browser interface. Existing account credentials stay in local account storage and are not documented in this repository.
