# Android verification — 3 November 2026

The internal APK is `artifacts/MockTaste-android-preview.apk` (52,617,933 bytes). Its adjacent `.sha256` file records SHA-256 `ee6d751508266b777d8d3c602cf67a5d94a68b01be9d994beaebb9a44422514a`. Android APK signature verification passes. It is signed with the local debug key for internal installation, includes its JavaScript, and does not need Metro. ABIs: arm64-v8a and x86_64.

## Native evidence

`artifacts/android-checks/result.json` records a passing complete device workflow. The related test run passed in 122 seconds through `test-changed`, with the Android device flag enabled and explicit changed-file paths. Type checking and the native release build also pass.

The dedicated Pixel 6 emulator runs Android 36 at 1080×2400 pixels, 420dpi. The run captured dark appearance at 1.3 font scale and a 1800×2560, 320dpi expanded-width override. Native screenshots, rather than browser renders, were inspected.

- Login, camera permission, native capture, normalized photo preview, and three-question completion.
- Explicit mate selection, sending, recipient opening through the real backend service, and the shared streak.
- Creating a private note, taking a timed sample test, saving answers, submission, answer review, system Back, and completion activity.
- Secure session restoration after a process restart and local sign-out after restarting with the backend unavailable.
- No fatal native or JavaScript errors in the device check.

Screenshots are numbered `01` through `08` under `artifacts/android-checks/`. The run uses temporary accounts and an isolated backend; existing workspace accounts and notes are not test fixtures.

## Toolchain and reproduction

The JDK 21, Android SDK 37.0, Build-Tools 36/37, NDK 27.1.12297006, CMake 3.22.1, Gradle 9.4.1, emulator image, and Python UI driver are installed under the ignored `.android-tools/` directory. The UI driver is pinned in `scripts/android-ui-requirements.txt`. It keeps a connection open and disables idle waiting: the standard Android hierarchy dump can return stale data while a one-second countdown is updating.

See [the Android guide](../mobile/README.md) for APK builds, the dedicated emulator, the workspace server, and scoped device checks. The current desktop workspace mobile listener is `http://10.17.71.1:4175`; the phone must share the computer's network. The address can change when Wi-Fi changes.

## Verification limits

AI responses in device tests are deterministic fixtures. Live ChatGPT authorization, OCR quality, generated question quality, physical camera quality, and real-device gesture/performance behavior are not established by this run. The actual app uses the student's desktop-managed AI connection. Store signing, public hosting, and publication remain outside this internal build.
