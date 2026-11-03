# MockTaste for Android

An Android-first React Native/Expo app: camera capture, photo preview, three-question mini quizzes, explicit mate selection, a private snap inbox, study codes and shared streaks, personal notes and document uploads, timed practice and answer review, and the practice calendar. The web admin panel remains separate.

## Requirements

Install Node.js 22.13 or newer, Android SDK and Platform-Tools, and JDK 21. Connect an Android phone with USB debugging enabled, or start an Android emulator. This repository uses Expo SDK 58. Android Studio is optional when the command-line SDK is installed.

## Installable local APK

This checkout has its downloaded JDK, SDK, emulator, and Gradle cache in the ignored `.android-tools/` directory at the repository root. The build script finds them automatically; `JAVA_HOME` and `ANDROID_HOME` can select another installation. Build requirements are Android SDK Platform 37.0, Build-Tools 37.0.0, NDK 27.1.12297006, and CMake 3.22.1.

Install the JavaScript dependencies with `rtk npm install` from `mobile/` if needed, then build from that directory:

```bash
rtk npm run apk
```

The resulting `artifacts/MockTaste-android-preview.apk` at the repository root includes its JavaScript and runs without Metro. It supports 64-bit Android phones and the x86_64 emulator. It is signed with the generated local debug key for internal testing. The preview explicitly enables private-network HTTP in both Android and the app; the desktop workspace still needs to be running and reachable.

For an internal APK restricted to HTTPS, run `rtk npm run apk -- --https-only`. The ordinary production configuration also requires HTTPS. Store signing and store publication are separate from these internal APKs.

To start the dedicated Android 36 Pixel 6 emulator, run `rtk npm run emulator` from `mobile/` (add `-- --window` to show its window). Its SDK package is `system-images;android-36;google_apis;x86_64`, and its serial is `emulator-5556`.

## Development build

From `mobile/`, install dependencies:

```bash
rtk npm install
```

Stop the old web dev server before starting the combined server, so both listeners share the same in-memory account and workspace services. From the repository root, replace the sample IP with your computer's Wi-Fi IP:

```bash
rtk npm run dev:mobile -- --mobile-origin http://192.168.1.10:4175 --mobile-bind 0.0.0.0
```

The phone and computer must be on the same network. The ordinary web panel stays on `127.0.0.1:4173`; only the separate student mobile API listens on port 4175. Do not use another computer's address or start a second backend against the same data directory. The origin must match the address entered on the phone, including its port.

For an Android emulator, keep the mobile bind at loopback and use its host alias:

```bash
rtk npm run dev:mobile -- --mobile-origin http://10.0.2.2:4175
```

From `mobile/`, compile and install the development app:

```bash
rtk env MOCKTASTE_LOCAL_NETWORK=1 npm run android
```

In the app, enter the same mobile origin as **Workspace address**, then use an existing Student login or create an account. Admin logins are accepted only in the web admin panel. For later sessions, `rtk npm start` from `mobile/` starts Metro for the installed development build.

`MOCKTASTE_LOCAL_NETWORK=1` enables Android cleartext HTTP and private-network workspace addresses for a local build. Production configuration requires an HTTPS workspace origin. Changing native configuration requires rebuilding the app; a Metro refresh is insufficient.

## AI connection

For this first build, sign into the desktop workspace with the same Student account and connect ChatGPT in Settings. Refresh Profile on the phone afterward. The photo is normalized locally and sent to that account's backend connection; no other student's or admin's AI credentials are used.

The current open-source ChatGPT-plan OAuth flow requires an HTTP `127.0.0.1` callback on the sign-in host. It cannot be moved to an arbitrary LAN callback or custom mobile URL. This build preserves the working desktop flow; it does not claim native ChatGPT-plan authorization. See the [official registration contract](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

## Distribution and checks

`eas.json` supplies an internal development APK profile and a production Android App Bundle profile. Cloud builds need the owner's Expo account, project registration, and signing setup; nothing has been uploaded or published.

```bash
rtk npx eas-cli build --platform android --profile development
```

The production profile has no local HTTP allowance. A production backend, public HTTPS, and a mobile-appropriate AI authorization/billing strategy remain deployment decisions.

Type checking and Android JavaScript export:

```bash
rtk npm run typecheck
rtk npm run bundle
```

Related automated tests run from the repository root through `rtk test-changed` with explicit file paths, following the project instructions. The backend stores native sessions hashed and the app keeps its session in SecureStore. Protected photos use bearer authorization; personal tests stay private. The sender-completes/recipient-opens streak rule is enforced by the existing backend.

The optional native device test is `tests/android-device.test.mjs`. Its UI driver is installed locally with:

```bash
rtk proxy python3 -m venv .android-tools/ui-venv
rtk proxy .android-tools/ui-venv/bin/pip install -r scripts/android-ui-requirements.txt
```

Run these commands from the repository root. The driver disables idle waiting so an updating test countdown does not produce a stale hierarchy. With the dedicated emulator running and the preview APK built, enable the device test with `MOCKTASTE_ANDROID_SMOKE=1` when running `test-changed` and explicitly include that test plus every source file changed in the task. It clears the app only on an emulator, creates temporary accounts and an isolated backend, and saves screenshots and a result record under `artifacts/android-checks/`. Its AI responses are deterministic fixtures; it does not verify a live ChatGPT connection or question quality.

Reference: [Expo camera](https://docs.expo.dev/versions/latest/sdk/camera/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [development builds](https://docs.expo.dev/develop/development-builds/introduction/).
