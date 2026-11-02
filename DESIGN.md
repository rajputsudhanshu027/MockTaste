# MockTaste interface

MockTaste is a laptop-hosted exam workspace. Its main tasks are uploading notes, creating tests, sharing exam links, and reviewing private reports. Those tasks take precedence over personal practice statistics and connection settings.

## Color

| Role | Value |
| --- | --- |
| Workspace background | `#F5F7FB` |
| Content surface | `#FFFFFF` |
| Primary text | `#17233C` |
| Secondary text | `#607086` |
| Action and selection | `#384BC2` |
| Successful state | `#16765C` |

Use indigo for primary actions and selected controls. The navigation sidebar uses ink navy with white branding and pale blue navigation labels. The overview launch panel uses indigo with white text and a white primary action. Use green for successful states, amber for warnings, and red for errors. Panels use a light border and no shadow. Use 14–16px panel corners and 9–10px control corners.

## Typography and layout

Public Sans is bundled locally with its Open Font License. Use the same family throughout the owner workspace and friend exam pages. Use tabular numerals for scores and timers. Body text and form inputs are 16px, secondary text is 14px, section headings are 20px, and main headings are 42px on desktop and 32–36px on smaller screens. Questions use 20–22px text and generous line spacing. Primary controls are at least 50px tall; compact actions are at least 44px tall.

The owner workspace uses a 264px navy navigation sidebar, an 88px white header, and left-aligned content within a 1480px maximum width. Desktop content has 40px horizontal padding. The sidebar provides a prominent Create a test action. The overview pairs a large launch panel with a readable three-step guide; workspace counts share one quiet summary strip. Test creation pairs document upload with test configuration on large screens and stacks them on smaller screens. Mobile navigation scrolls horizontally, summary counts become rows, and form fields stack without reducing text size. Saved tests precede personal attempts. Sharing links and received reports precede the collapsed connection settings.

Friend exam pages use one reading column with visible radio controls, question numbers, and a separate submission area. Keep the exact brand marker used by the public connection check. Report review offers a PDF download for the creator to send directly. The PDF follows the same typography and colors, includes answer review and feedback, and adds page numbers for longer reports.

## Interaction

Use visible focus rings, native file inputs, clear selected states, and consistent action names. Honor reduced motion. Preserve readable file names and long question text on mobile. Icons are simple SVG interface geometry; they supplement visible labels.
