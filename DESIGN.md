---
name: MockTaste UI
description: Shared web foundations, components, and page patterns for the exam workspace.
colors:
  day-canvas: "#f5f5f5"
  day-surface: "#ffffff"
  day-text: "#141414"
  day-muted: "#5c5c5c"
  day-raised: "#e9e9e9"
  day-line: "#d9d9d9"
  night-line: "#505050"
  night-grid: "#50505066"
  day-error: "#9f2d1c"
  day-accent: "#141414"
  signal-green: "#30a81d"
  forest: "#21935b"
  highlight-yellow: "#fecc33"
  ember: "#ff8400"
  day-grid: "#d9d9d966"
  night-canvas: "#202020"
  night-surface: "#2b2b2b"
  night-text: "#f5f5f5"
  night-muted: "#c4c4c4"
typography:
  heading:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.13
    letterSpacing: "-.02em"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Mono, JetBrains Mono, Space Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: ".06em"
rounded:
  small: "4px"
  control: "8px"
  panel: "16px"
  panel-compact: "16px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-7: "28px"
  space-8: "32px"
  space-10: "40px"
  space-12: "48px"
  space-16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.day-accent}"
    textColor: "{colors.day-surface}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "52px"
  input:
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "13px 15px"
    height: "52px"
  panel:
    rounded: "{rounded.panel}"
    padding: "{spacing.space-8}"
---

# Design System: MockTaste UI

## Overview

MockTaste is a laptop-hosted exam workspace. Its visual language follows Flim’s analog working surface: paper-gray canvas, a quiet engineering grid, white work sheets, near-black ink, and small green or ember state signals. The product keeps its own name, logo shape, content, and study workflows. Task clarity and privacy remain ahead of decoration.

The executable system is [tokens.css](public/design-system/tokens.css), [components.css](public/design-system/components.css), and [patterns.css](public/design-system/patterns.css). Inspect the live catalog at `/design-system` ([source](public/design-system/index.html)). Runtime CSS is authoritative; this document's extracted frontmatter and [.impeccable/design.json](.impeccable/design.json) are derived records, never independently editable palettes. Refresh them after changing the library.

Authentication and initial boot/loading markup use `ds-*` components and patterns; see [workspace.js](public/workspace.js). The shared semantic palette also drives the owner workspace, student surfaces, friend exams, and reports. Android retains native Material 3, system typography, navigation, safe areas, and light/dark themes, using the same ink, paper, and restrained signal colors.

## Colors

Use semantic `--ds-color-*` roles. The light scheme uses a `#f5f5f5` paper canvas, a subtle `#d9d9d9` 24px grid, white surfaces, and `#141414` ink. Primary actions are near-black with white type. Mist (`#e9e9e9`) groups secondary information. Signal green and forest green mark successful states; ember indicates warnings. Highlight yellow is only for inline marked words, never a large panel. Errors use a readable warm red. Cards and photo tiles have fine hairlines and no shadows.

Set `data-ds-theme="day"` on web authentication to share the grid paper, black actions, and white surfaces. Sign-in and account creation share the same card, stacked fields, and action treatment; creation grows naturally to fit its additional fields. Keep green and ember tied to functional status. A graphite night scheme remains available. The library owns page textures and component materials. Never introduce a private palette or gradient in a feature.

## Typography

Use Arial or the system sans for body reading. Use the system mono stack for uppercase navigation, labels, buttons, and compact annotations at 12px with `0.06em` tracking. Body copy is 16px; section titles are 20–21px; headings are 32px with a measured 1.13 line height and medium weight. Keep the existing MockTaste logo; do not imitate Flim’s Swizzy display face with an unrelated system font.

Questions use 20–22px and generous line spacing. Scores and timers use tabular numerals. Friend exams and report PDFs use the same ink, paper, hairline, and success colors. PDFs include answer review and feedback, with page numbers on longer reports.

## Layout

Compose layouts in `patterns.css`. Entry centers the brand above one content-sized white work sheet, at most 420px wide, over the shared grid. It allows vertical scrolling on short screens. Outer padding is 40px by 24px; at `max-width: 760px`, it is 28px by 20px. Panel padding reduces from 32px to 24px. Render only the selected form. The catalog uses a 1120px maximum width and 180px navigation column, becoming one column at the compact breakpoint.

Keep the owner workspace's 264px light navigation rail with hairline divider, 88px white header, and left-aligned content within 1480px. Navigation is ghost text in uppercase mono; the selected item uses an ink fill. Keep Create a test prominent. The overview pairs a clear launch surface with a three-step guide and quiet summary strip. Test creation pairs upload with configuration on large screens and stacks them on smaller screens. Photo collections use loose CSS columns and natural image proportions inside 16px hairline frames; columns collapse with available width. Mobile navigation scrolls horizontally, counts become rows, and fields stack without shrinking text. Preserve long file names and question text. Saved tests precede personal attempts; sharing and received reports precede collapsed connection settings.

Friend exams use one reading column with visible radio controls, question numbers, and a separate submission area. Keep the exact brand marker used by the public connection check. Report review offers a PDF download for the creator to send directly.

## Elevation & Depth

Use borders and paper contrast for grouping. Panels, cards, and controls have no shadows, glass, blur, or gradient rims. The shared grid is part of the working surface. Depth and fill values belong to `tokens.css`.

Controls transition over 150ms. Entry panels move into place over 350ms using the shared easing and a 4px starting offset. Entry animation runs only without a reduced-motion preference; reduced motion disables input and button transitions. Keep this behavior in shared components and patterns.

## Shapes

Shared controls and actions have 8px corners; panels and photo cards have 16px corners; small links use 4px corners. Standard controls have a 52px minimum height and compact/reveal actions at least 44px targets. Use the four-pixel spacing scale.

## Components

Load tokens before components and patterns. The document body owns the paper canvas and grid. `.ds-page` establishes type, semantic text, focus, selection, and caret. Components own internal spacing and states.

| Purpose | Shared API | Contract |
| --- | --- | --- |
| Surface | `.ds-panel` | Content determines height; theme determines material. |
| Typography | `.ds-heading`, `.ds-section-title`, `.ds-copy`, `.ds-note` | Use semantic headings and documented hierarchy. |
| Field | `.ds-field`, `.ds-label`, `.ds-input`, `.ds-field-note` | Persistent associated labels, native input types/autocomplete, and associated help/errors. |
| Action | `.ds-button`, `.ds-button--secondary`, `.ds-button--block` | One primary task action; native `disabled` and `aria-busy` during requests. |
| Text action | `.ds-link` | Anchor for navigation; button for an action. |
| Password | `.ds-password`, `.ds-icon-button`, `.ds-eye-slash` | Synchronize Show/Hide labels, `aria-controls`, and `aria-pressed` with visibility. |
| Feedback | `.ds-alert` | Alert region for request/validation errors; `aria-invalid` on invalid fields. Empty feedback is hidden. |
| Skip navigation | `.ds-skip-link` | Keyboard-visible bypass link using the shared stacking token; supply a focusable main-content target. |
| Entry | `.ds-page--entry`, `.ds-entry`, `.ds-form-heading`, `.ds-form`, `.ds-account-switch`, `.ds-entry-note` | Brand, one form panel, account switch, and privacy note. |
| Account role | `.ds-field.ds-role`, `.ds-role-note` | Native Student/Teacher select; classroom guidance for Teacher. |

Start sign-in or account creation with `<div class="ds-page ds-page--entry" data-ds-theme="day">`, then compose `.ds-entry`, `.ds-panel`, labeled fields, and `.ds-button.ds-button--block`. Both modes share the same ink action; reserve green for success feedback. The catalog demonstrates the actual shared controls, variants, and states.

Sign-in contains email and password; sign-up adds name, password confirmation, and the public role selector. Account switching changes the selected form and focuses its first field. During submission show “Signing in…” or “Creating account…”, set `aria-busy`, prevent duplicate requests and account switching, and restore state when finished. Keep privacy text below the card. Decorative light stays outside the accessibility tree. Simple SVG icons supplement visible labels; preserve native file inputs elsewhere.

## Do's and Don'ts

- Use only the dedicated system for new or migrated web surfaces. Extend a token, component, or pattern in the library and add its catalog example **before** feature use.
- Define visual values in `tokens.css`; components consume them and patterns compose them. Keep focus, hover, active, disabled, loading, error, and reduced-motion states with the component.
- Do not add feature-specific visual overrides, private colors/dimensions, inline visual styles, copied components, or a parallel authentication stylesheet.
- Preserve accessible names, visible focus, native semantics, readable mobile content, and consistent action names.
- Keep docs/previews derived from runtime CSS. Preserve Android's native boundary.
