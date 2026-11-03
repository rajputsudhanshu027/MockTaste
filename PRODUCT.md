# MockTaste

<!-- impeccable:product-schema 1 -->

## Platform

android

The student product targets Android first with a native camera-first app. The existing web student workspace remains available, and the owner and their friend retain the web admin panel.

## Users

Students across subjects, courses, and exam categories create private accounts. Teachers have a separate public account type; their teaching workflows are intentionally undecided. The owner and their friend use the existing panel as a private admin workspace.

## Product Purpose

Turn a student's own study material into personal practice tests, saved answer reviews, and a visible history of consistent practice. Study snaps let students photograph what they are studying, complete a three-question mini quiz, and share the photo with accepted study mates.

## Operating Context

The Node.js backend runs on a computer. Its existing RRB preparation and friend-exam workflows remain in the loopback-only admin panel. An optional, separate student-only API listener supports the Android app on an explicitly configured network address. This implementation does not publish or migrate hosting.

## Capabilities and Constraints

- Public registration supports student and teacher roles only. Administrators are provisioned privately.
- Student material, notes, tests, and results belong to that individual account. Students cannot share tests or use the admin friend-link service.
- Study snaps are an explicit exception for selected study photos and captions only. Study mates exchange private codes and accept requests before sharing. Personal libraries, mini-quiz answers, and scores stay private.
- A student must answer every mini-quiz question before sending a snap; a perfect score is not required. A shared streak day is earned when one mate sends a quiz-completed snap and the other opens it on the same day. Either mate can send; duplicate sends or opens never add extra days.
- Shared streaks use the requesting mate's time zone, fixed when the connection is created and visible to both students. Photos are retained until the sender deletes them; this first version does not implement disappearing messages.
- Student generation supports subjects beyond RRB and uses only their selected study material.
- A GitHub-style activity calendar shows completed tests and snap mini quizzes, with current and longest streaks. Logins, uploads, sending, and opening alone do not count as personal study completions.
- Existing admin data and capabilities are preserved.
- The Android app opens to the native camera, with Snaps, Mates, Study, and Profile destinations. It reuses student accounts, study material, practice tests, and activity history from the configured workspace.
- Mobile application sessions are stored in Android secure storage. The mobile API does not serve the web admin panel or accept browser cookies for authentication.
- The first Android build uses the existing computer-managed ChatGPT connection. Direct mobile ChatGPT-plan sign-in, public hosting, app-store distribution, and push notifications are not included.
- Teacher assessment and classroom features remain open decisions.

## Brand Commitments

Keep the MockTaste name, logo, and navy/indigo/green identity. Web retains Public Sans and its established interface; Android uses Material 3 components, system type, native navigation, safe-area insets, and light/dark themes.

## Product Principles

- Keep personal practice private.
- Separate assessment content from exam-specific presets.
- Count completed practice honestly.
- Preserve the owner's existing workspace.
