---
name: MockTaste Android
description: Native camera-first study and private study-mate sharing
colors:
  primary-light: "#141414"
  primary-dark: "#f5f5f5"
  on-primary-light: "#ffffff"
  on-primary-dark: "#141414"
  primary-container-light: "#e9e9e9"
  primary-container-dark: "#3a3a3a"
  on-primary-container-light: "#141414"
  on-primary-container-dark: "#f5f5f5"
  secondary-container-light: "#e9e9e9"
  secondary-container-dark: "#3a3a3a"
  tertiary-light: "#155a38"
  tertiary-dark: "#75d36a"
  tertiary-container-light: "#e6f3eb"
  tertiary-container-dark: "#1e3d25"
  background-light: "#f5f5f5"
  background-dark: "#202020"
  surface-light: "#ffffff"
  surface-dark: "#2b2b2b"
  on-surface-light: "#141414"
  on-surface-dark: "#f5f5f5"
  surface-variant-light: "#e9e9e9"
  surface-variant-dark: "#3a3a3a"
  outline-light: "#777777"
  outline-dark: "#777777"
  error-light: "#9f2d1c"
  error-dark: "#ff9a88"
typography:
  displaySmall:
    fontFamily: "sans-serif"
    fontSize: "36px"
    fontWeight: 400
    lineHeight: "44px"
    letterSpacing: "0"
  headlineMedium:
    fontFamily: "sans-serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: "36px"
    letterSpacing: "0"
  headlineSmall:
    fontFamily: "sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: "32px"
    letterSpacing: "0"
  titleLarge:
    fontFamily: "sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: "28px"
    letterSpacing: "0"
  titleMedium:
    fontFamily: "sans-serif-medium"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
    letterSpacing: "0.15px"
  bodyLarge:
    fontFamily: "sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0.15px"
  bodyMedium:
    fontFamily: "sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0.25px"
  bodySmall:
    fontFamily: "sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
    letterSpacing: "0.4px"
  labelLarge:
    fontFamily: "sans-serif-medium"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "0.1px"
rounded:
  field: "4px"
  choice: "12px"
  panel: "16px"
  button: "20px"
  day: "2px"
spacing:
  calendar: "4px"
  gap: "8px"
  paragraph: "12px"
  control: "16px"
  page: "20px"
  panel: "24px"
  permission: "28px"
  pageBottom: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.on-primary-light}"
    typography: "{typography.labelLarge}"
    rounded: "{rounded.button}"
    height: "48px"
  button-outlined:
    textColor: "{colors.primary-light}"
    typography: "{typography.labelLarge}"
    rounded: "{rounded.button}"
    height: "48px"
  field-outlined:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.on-surface-light}"
    typography: "{typography.bodyLarge}"
    rounded: "{rounded.field}"
    height: "56px"
  panel:
    rounded: "{rounded.panel}"
    padding: "24px"
  camera-control:
    size: "56px"
  calendar-day:
    rounded: "{rounded.day}"
    size: "12px"
---
# Design System: MockTaste Android

## Overview

**Creative North Star: "Study it. Snap it. Make it stick."**

MockTaste's Android app translates the paper-and-ink identity into native Material 3 controls. The camera leads into private practice and deliberate sharing; light and dark modes keep neutral surfaces, near-black actions, and restrained green status.

This document records rules from `src/theme.ts`, `src/App.tsx`, `src/screens.tsx`, `src/useWorkspace.ts`, and the installed React Native Paper MD3 defaults. It is separate from the web system in the repository-root DESIGN.md. Android 36 emulator rendering has been inspected in light/dark themes, at 1.3 font scale, and with an expanded-width override. Installation, camera permissions and capture, and system Back were exercised. Physical-device gesture and performance checks remain separate. See `../docs/android-verification.md` for evidence. **Visual finish: inspected on emulator.**

**Key Characteristics:**
- Native Material controls and system Android type.
- Camera-first navigation with five persistent destinations.
- Paper and graphite working surfaces, ink actions, and green activity.
- Explicit photo preview and recipient selection before sharing.

## Colors

Near-black identifies primary actions, neutral surfaces establish the workspace, and green records completed practice. Frontmatter lists the app's Material roles for light and dark themes. The runtime source is `appTheme(dark)`; all visible Material roles use the shared palette.

### Primary

Use primary/onPrimary for contained actions and primaryContainer/onPrimaryContainer for tonal controls. Light and dark values are paired by their suffixes in the frontmatter.

### Secondary

Secondary roles use neutral ink and mist. Their on-colors preserve contrast for native controls.

### Tertiary

Tertiary and tertiaryContainer drive the practice calendar and indicate completed work. Shared streak text is separate from the personal calendar.

### Neutral

Background surrounds the workspace; surface hosts inputs and capture controls. Text, outlines, errors, and surfaceVariant use paper, mist, ink, ember-red, and graphite roles. Elevation stays tonal and grayscale, consistent with Material 3.

**The Role Pair Rule.** Use the active theme's role and its on-role partner for controls and text; select light or dark through appTheme rather than mixing modes.

## Typography

**Display and Body Font:** Android's native `sans-serif`.
**Medium Font:** Android's native `sans-serif-medium`.

Paper's MD3 type scale is inherited without a custom font configuration. Frontmatter uses portable CSS strings; on Android these correspond to the source's logical font-size/line-height values, with font scaling. Layout dimensions below are density-independent units (dp), not physical pixels.

- **Display:** displaySmall on the sign-in introduction.
- **Headline:** headlineMedium for the brand introduction, study code, and job heading; headlineSmall for screen headings, streaks, and quiz questions.
- **Title:** titleLarge for sections and test questions; titleMedium for compact labels and result detail.
- **Body:** bodyLarge for reading and options; bodyMedium for supporting content; bodySmall for account and connection guidance.
- **Label:** labelLarge is inherited by native buttons. Study codes additionally use letter spacing of 2.

**The Native Type Rule.** Use Paper Text variants and inherited Android fonts. Keep React Native font scaling enabled; enlarged-type rendering still requires device review.

## Layout

The signed-in root starts at Camera. Below 720dp window width, a bottom navigation bar carries Camera, Snaps, Mates, Study, and Profile. At 720dp and above, a 200dp side drawer replaces the bottom bar. The app configuration is portrait. The drawer was checked through an Android emulator override of 1800×2560 pixels at 320dpi; this is layout evidence rather than physical-tablet performance evidence.

Scrollable content uses 20dp padding, 48dp bottom padding, an 8dp gap, and an 860dp maximum width centered in the available region. Panels use 24dp padding; sections use 24dp above and 8dp below; paragraphs use 12dp vertical margins. Camera content fills the remaining app-bar/navigation space, with controls positioned 24dp above its bottom and 16dp from its sides.

SafeAreaProvider and useSafeAreaInsets protect the top app bar and bottom navigation. Expanded layouts reserve bottom inset space. Status-bar icons switch between dark and light content with the theme. Detail/photo Back actions and hardware Back share the workspace controller; return paths eventually reach Camera before allowing the system to leave the app. System Back was exercised from answer review; physical gesture behavior remains unverified.

## Elevation & Depth

Paper Surface uses native elevation levels 0 and 1 for list rows, panels, and the test timer. Background, surface, and MD3 elevation colors provide tonal layering; the inherited elevation palette is recorded in the sidecar. Dialogs, navigation, ripple/state layers, and snackbars use Paper defaults. No custom app shadow formula is introduced.

**The Native Surface Rule.** Keep Paper's native Surface and state treatments. Do not copy the web panel's flat-surface rule into Android.

## Shapes

Panels and contained photo previews use 16dp corners. The capture preview has a 280dp maximum height to keep the quiz action within reach. Choice rows use 12dp corners, and calendar squares use 2dp corners. Inherited Paper roundness is 4, giving outlined fields 4dp corners and buttons 20dp corners in the installed MD3 implementation. Do not replace these native relationships with the web's corner scale.

## Components

### Buttons

The shared wrapper enforces a 48dp minimum on both button and content. Contained actions use primary/onPrimary; outlined and text actions retain native Paper treatments. Camera icon controls are 56dp square, have accessibility labels, and use Paper contained/contained-tonal states. Disabled/loading states reflect in-flight work.

### Inputs / Fields

Field wraps an outlined TextInput with 56dp minimum height and 8dp vertical margins. Multiline editors use a 240dp minimum and 16dp margins instead. Focus, errors, labels, outlines, keyboard integration, and selection remain native. Email and workspace address fields use their corresponding keyboard types; passwords remain masked.

### Navigation

A native app bar provides title, detail/photo Back action, and refresh. Bottom navigation and the expanded drawer share the same five destinations and selected state. Icons come from the app's MaterialCommunityIcons renderer; the source does not use decorative glyph icons.

### Chips / Tags

The camera prompt uses Paper's Chip with a book icon. Its shape, text, state behavior, and tonal treatment remain library defaults; no independent chip token scale is added.

### Cards / Containers

Surface panels group the study code, mini-quiz completion, and timer. Panel corners and padding come from the shared styles; native elevation remains the source of surface color and depth. Ordinary inbox/test entries use Paper lists rather than web cards.

### Camera and photo preview

The permission screen offers Enable camera or Open camera settings. The camera shows a capture prompt, torch control, shutter, and camera switch. A captured photo is normalized before preview. Previews use contain sizing at a 0.8 width/height ratio, preserving page content rather than cropping it. A photo does not send automatically: generation, completed mini quiz, accepted-mate selection, and Send study snap are distinct actions.

### Practice calendar

A horizontal 53-week calendar uses 12dp cells and 4dp gaps, with a dated text list available through a button. It records completed tests and mini quizzes. Opening a mate's photo alone affects only the shared streak rules, not personal practice activity.

## Do's and Don'ts

### Do:
- **Do** retain all five destination labels and the camera as the initial destination.
- **Do** use the shared Button and Field wrappers for consistent minimum dimensions.
- **Do** preserve safe-area padding, standard Back behavior, labeled camera controls, and readable photo previews.
- **Do** verify light/dark modes and enlarged fonts on Android before claiming rendered approval.

### Don't:
- **Don't** import the web Public Sans face, sidebar geometry, or CSS values as Android defaults.
- **Don't** treat the sidecar's browser component references as native screenshots or approval.
- **Don't** expose personal quiz answers or scores in shared snap views.
- **Don't** add a native AI sign-in claim: this build uses the same account's desktop-managed connection.
