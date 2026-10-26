# Design system

The look and the UI rules of Valedocs, as implemented in `src/ui/styles.css`. The audience is an older,
non-technical user on a phone or an old laptop, often with low vision. Every choice serves that.

## Principles

1. **One thing per screen, in order.** A numbered 3-step guide per report; each step says what it is for in one
   line (`optionRow` puts a one-line explanation next to every button).
2. **Big and obvious.** Buttons are at least 48 px tall (`.btn`), grade buttons 52 px (`.btn-grade`), the primary
   action is filled blue, and there is exactly one primary action per step.
3. **Plain Spanish, no jargon.** Placeholders start with "Ejemplo:" so they are not mistaken for data. Errors say
   what to do next. No raw technical messages.
4. **Nothing moves by itself.** No decorative motion; transitions are 120 ms and disabled under
   `prefers-reduced-motion`. A small tap never rebuilds a long list (scroll position is kept).
5. **Legible by default.** Atkinson Hyperlegible (made for low vision), 18 px base, a "Letra más grande" toggle
   to 22 px (`html.large-text`), a day/night toggle that follows the device until she picks.

## Tokens

Defined on `:root` (day) and overridden for night (`@media (prefers-color-scheme: dark)` unless
`data-theme="light"`, and `:root[data-theme="dark"]`).

| Token                           | Day                   | Night                 | Used for                                            |
| ------------------------------- | --------------------- | --------------------- | --------------------------------------------------- |
| `--bg`                          | `#eef2f6`             | `#12161c`             | Page background (cool grey so cards stand out)      |
| `--surface`                     | `#ffffff`             | `#1b212a`             | Cards, buttons, fields                              |
| `--text` / `--muted`            | `#1b2430` / `#4a5566` | `#eef1f5` / `#a6b0bf` | Text and secondary text                             |
| `--border`                      | `#c3ccd7`             | `#3a4452`             | Dividers                                            |
| `--control-border`              | `#7a8698`             | `#6b7687`             | Edges of things she taps or types in (3:1 contrast) |
| `--primary` / `--primary-hover` | `#1e4bb8` / `#1a3d94` | `#6ea0ff` / `#93b8ff` | Primary buttons, links, selected tab                |
| `--bar-bg` / `--bar-text`       | `#1e3a5f` / `#fff`    | `#0f1d30` / `#eef1f5` | Top bar (the ink blue of a register's cover)        |
| `--ok` / `--ok-bg`              | `#166534` / `#e2f3e7` | `#86efac` / `#14301f` | Success banners, autosave banner                    |
| `--warn` / `--warn-bg`          | `#92400e` / `#fef3c7` | `#fcd34d` / `#3a2e0c` | Warnings (pending work)                             |
| `--danger`                      | `#b91c1c`             | `#fca5a5`             | Delete and start-over buttons                       |
| `--empty-bg`                    | `#fde3bf`             | `#2a2118`             | Cells still to fill in                              |
| `--selection`                   | `#c9d9f6`             | `#2a4a80`             | Selected cell in the keyboard grid                  |
| `--radius`                      | `12px`                |                       | Corners of buttons, cards, dialogs                  |
| `--shadow`                      | subtle                | none                  | Cards                                               |
| `--fast`                        | `120ms`               |                       | The only transition duration                        |

Type scale: body `1rem` (18 px, 22 px in large-text mode), `h1` 1.6 rem, `h2` 1.2 rem, `h3` 1.1 rem, big
buttons 1.15 rem. Line height 1.5.

## Logo and images

The logo is the paw of Vale (the maintainer's dog, who gave the app its name) stamped on a report sheet: an
ink-blue (`#1e3a5f`) rounded square, a white sheet with a light-blue folded corner (`#b9c8ee`), and an ink paw.
`public/favicon.svg` is the source; every other image is drawn from it. In the top bar the square is left out
(the bar is already ink blue) and the paw takes `--bar-bg`, so it follows night mode.

| File                                  | Size        | Used for                                                            |
| ------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `public/favicon.svg`                  | vector      | Browser tab, manifest                                               |
| `public/favicon-32.png`               | 32 x 32     | Tab icon for browsers without SVG favicons                          |
| `public/apple-touch-icon.png`         | 180 x 180   | iPhone/iPad home screen (full square, iOS rounds the corners)       |
| `public/icon-192.png`, `icon-512.png` | 192, 512    | Android home screen (`manifest.webmanifest`)                        |
| `public/icon-maskable-512.png`        | 512 x 512   | Android adaptive icon (logo inside the central safe zone)           |
| `public/og-image.png`                 | 1200 x 630  | Link preview when the address is shared on WhatsApp, Facebook, etc. |
| `docs/images/readme-banner.png`       | 1280 x 400  | README header (rendered at 2x)                                      |
| `docs/images/social-preview.png`      | 1280 x 640  | GitHub social preview (Settings > General > Social preview)         |
| `docs/images/promo-square.png`        | 1080 x 1080 | Promo to share with teachers, in Spanish                            |

The promo images use the Atkinson Hyperlegible font, the `--bg` background, a faint trail of paw prints, and the
screenshots of `docs/screenshots/` (invented data only). The manifest uses `"display": "browser"`, so the home
screen icon opens the normal browser, with its back button and downloads working as usual. Never put a school's
name or logos in these images.

## Components (CSS classes)

| Component          | Classes                                                                                                        | Notes                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Button             | `.btn`, `.btn-primary`, `.btn-big`, `.btn-small`, `.btn-text`, `.btn-danger`, `.btn-danger-soft`, `.btn-grade` | 2 px border, bold, pressed state on tap (`--pressed`). `.active` marks the chosen option in a `.toggle` group. |
| Option row         | `.option-row`                                                                                                  | A control on the left, a one-line `.muted` explanation on the right (stacks on phones).                        |
| Card               | `.card`, `.cards`, `.hub-card`                                                                                 | One class, one month, or the home entry point.                                                                 |
| Section / box      | `.section`, `.box`, `.danger-zone`                                                                             | Grouping on long screens.                                                                                      |
| Guide              | `.steps`, `.step`, `.step-num`, `.step-done`, `.steps-banner`                                                  | Numbered circles; ✓ when done. The banner repeats the 3 steps on top of inner screens.                         |
| Banners            | `.success-banner`, `.warning-banner`, `.saved-banner`                                                          | Pending work lists live in `.warning-banner > .pending-list` with a button per line.                           |
| Notice             | `.notices`, `.notice`, `.notice-ok`, `.notice-error`, `.notice-action`                                         | Bottom toast, 4–8 s, optional action button (undo).                                                            |
| Dialog             | `.dialog-backdrop`, `.dialog`, `.dialog-buttons`                                                               | Our own modal; Escape closes; the primary button accepts.                                                      |
| Fields             | `.field`, `.field-error`, `.form`, `.field-pair`, `.checkbox`, `.chips`, `.chip`                               | Text fields save on `change`, not per keystroke, when a re-render would swallow a click.                       |
| Entry grid         | `.grades-table`, `.cell`, `.selected`, `.empty`, `.keypad`, `.keys-help`                                       | Desktop keyboard entry: arrows, Enter, letters, Ctrl+Z.                                                        |
| Entry list (phone) | `.grade-list`, `.grade-row`, `.grade-buttons`, `.next-step`, `.day-nav`, `.tabs`, `.tab`                       | One column/day at a time; a big "next" button at the end so she never scrolls back up.                         |
| Progress           | `.progress-bar`, `.progress-fill`                                                                              | "done of total" with a text alternative.                                                                       |
| Preview sheet      | `.sheet`, `.sheet-header`, `.sheet-table`, `.sheet-frame`                                                      | Mirrors the printed report (same layout object as Excel/PDF).                                                  |
| File zone          | `.file-zone`, `.file-zone-help`, `.file-zone-or`                                                               | Drag-and-drop plus a button; the button is the one that matters on phones.                                     |
| Top bar            | `.top-bar`, `.brand`, `.top-actions`, `.top-button`                                                            | Brand goes home; text-size and theme toggles.                                                                  |

## Layout rules

- Phone breakpoints: `max-width: 760px` switches the entry screens to the big-button mode by default,
  `640px`/`560px`/`440px` stack rows and shrink paddings. Base rules come **before** the media queries, so a rule
  added after the phone block does not silently override it.
- Tables that may overflow sit in `.table-scroll`; the page itself never scrolls sideways.
- `@media print` hides the chrome so a preview can be printed as a last resort.

## Accessibility

Buttons carry `aria-label`s that name the student and the column/day; toggles use `aria-pressed`; tabs use
`role="tablist"`/`tab` with `aria-selected`; banners are `role="status"` or `alert`; dialogs are
`role="dialog"` with `aria-modal`; the notices area is a polite live region. Keyboard: every entry grid works
with arrows, Tab, Enter, Delete and Ctrl+Z without a mouse.
