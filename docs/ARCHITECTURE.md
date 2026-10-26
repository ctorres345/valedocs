# Architecture

How Valedocs is organised and why. Written for someone new to the project.

## What it is

A static single-page app: Vite + TypeScript, no UI framework, hash routing (`#/…`). Everything the user enters is
kept in the browser (IndexedDB through `idb-keyval`) and in the files she downloads. There is no backend: the
site is a folder of static files served by Cloudflare Workers (`wrangler.jsonc`), and the only network call
is the optional Google Drive upload.

Two things shaped every decision:

- **The user is not technical.** Big buttons, a numbered 3-step guide per report, plain Spanish, our own
  dialogs, autosave with a visible banner, undo. Nothing may send her back to the top of a long list.
- **Her files are hostile.** Teachers' workbooks hold hundreds of thousands of invisible shapes. So names are read
  with our own XML reader that skips drawings (`import/read-names.ts`), in a Web Worker, and output is always
  generated from scratch. The old file is never used as a template.

## The one rule: dependencies point down

```
            main.ts            router and startup; may import anything
               |
             views/            one file per screen; builds the DOM, reads/writes the store, turns domain
               |               codes into Spanish messages (texts.ts), dynamic-imports the builders
      +--------+--------+
   export/   import/   storage/   export: Excel (exceljs), PDF (jspdf), Word (hand-written OOXML), Drive
      |         |         |       import: read-names + clean (pure, on bytes) behind worker-client
      |         |         |       storage: store (IndexedDB, autosave, backup, school pack), logos
      +--------+--------+
               |
              ui/              dom helpers and dialogs, texts.ts (ALL Spanish strings), steps banner, styles
               |
            domain/            pure logic, no browser APIs, no imports from other folders
```

`domain/` knows what a class, a student, a month or a report _is_, how to validate a name, how to count
absences, and what each report looks like (`*-layout.ts`: headers, widths, file names). It does not know about
IndexedDB, Excel or the DOM. That is why its tests run in Node without a browser and why Excel, PDF, Word and the
on-screen preview cannot drift apart: they all read the same layout object.

`scripts/check-layers.mjs` (part of `npm run check`) fails when a folder imports one it may not. The allowed
table is at the top of that script.

## Folders

| Folder        | What lives there                                                                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain`  | `model.ts` (types, defaults, ids, name/label helpers), `attendance.ts` (months, marks, summaries, pending work), `norms.ts`, `quarter.ts`, `validation.ts` (`ClassProblem` codes), `text.ts`, and one `*-layout.ts` per report (conduct, attendance, consolidated, norms, quarter). |
| `src/storage` | `store.ts`: the single `AppData` in memory, `change()` (notify + debounced autosave), `validateData` (upgrades v1–v5, cleans every field), backup and school pack files. `logos.ts`: the two logos, custom ones in IndexedDB, bundled defaults optional.                            |
| `src/import`  | `read-names.ts` (names, gender and workshop columns from an .xlsx, drawings skipped), `clean.ts` (strips invisible shapes), `worker.ts` + `worker-client.ts` (both run off the main thread; errors become Spanish messages in the client).                                          |
| `src/export`  | `build-xlsx.ts`, `build-pdf.ts`, `build-docx.ts` (OOXML zipped with fflate, no Word library), `norms-files.ts` (one file or a zip per student), `drive.ts` (Google Identity Services, `drive.file` scope).                                                                          |
| `src/ui`      | `dom.ts` (`h()`, notices, dialogs, file pickers, tabs), `texts.ts`, `steps.ts`, `styles.css`, the bundled font.                                                                                                                                                                     |
| `src/views`   | One file per screen, each exporting `xxxView(): View` (`{ el, destroy? }`). Shared pieces: `grid-keys.ts` (entry mode, undo stack, keyboard grid), `month-kind.ts` and `months-warning.ts` (what attendance and norms share), `saving-banner.ts`, `start-over.ts`.                  |
| `tests`       | Vitest. `fixtures.ts` builds synthetic teacher workbooks with invented names.                                                                                                                                                                                                       |
| `scripts`     | `embed-logos.mjs` (optional bundled logos), `check-layers.mjs`.                                                                                                                                                                                                                     |

## Data

One object, `AppData { version, settings, classes }`, lives in memory and is saved whole under the IndexedDB key
`valedocs:data` 300 ms after the last change (and immediately on `pagehide`). Logos are saved separately under
`valedocs:logos`. Per-browser preferences (text size, theme, entry mode, chosen months) are in `localStorage`
under `valedocs:*` keys.

- A **class** has a label (`5° A - SECUNDARIA`), a tutor name, students and `attendanceMonths` (the school days
  of each opened month). Attendance and norms share those months: opening, changing or deleting a month
  (`setMonthDays`, `deleteMonth`) keeps both reports' data in step.
- A **student** has conduct `grades` (one per settings column), `attendance[month]` (one mark per school day),
  `norms[month]` (criteria × days), an optional special `note` that replaces the grades (a transfer, for
  example), a gender (`H`/`M`/`''`), a workshop code and `quarter` (the quarter norms grades she chose by hand
  and her observations; an empty grade means the suggestion computed from `norms` is printed).
- **Settings** hold the header texts, the column headers, the allowed grades, the attendance uniform note, and the
  norms title and paragraphs, and the quarter report's title, rows, months and auxiliary name (the last two are
  hers, so a school pack leaves them out and loading one keeps them). Together with the logos they form a **school pack**, a JSON file a school can carry
  to another device; a **backup** is the same plus the classes.

`validateData` is the only door for data coming from disk or a file: it accepts versions 1 to 6, fills every
missing field, drops malformed months and marks, and returns version 6. When stored data cannot be read (saved
by a newer version, or the browser refused), the store **locks**: nothing is saved, every editable screen shows
a warning, and a backup download is refused because it would be empty.

## Screens and navigation

`#/` is a menu. `#/steps` is the classes screen (import, class cards, pick a report). Each report has a 3-step
guide (`#/conduct`, `#/attendance`, `#/norms`, `#/quarter`; `reportView(kind)` in `views/register.ts`, driven by the `REPORTS`
table) whose steps are: classes (done), class cards with the tutor name and the entry button, preview and
download. Entry screens (`grades.ts`, `attendance.ts`, `norms.ts`) share the same shape: a keyboard grid on
desktop, one column or day at a time with big buttons on phones, undo, "fill empty with A", and a footer that
lists the other classes still pending instead of offering the download.

Every "next/download" button opens the export of its own report; every back button goes to its guide. The
export screens respect the per-class "include" selection, warn about missing grades, and block only on data that
is printed in every row (workshop in attendance, gender in norms) while skipping students with a special note.

## Why these libraries

- **No framework.** The screens are built with a 20-line `h()` helper. The app is small, the first load must be
  tiny on an old phone, and one maintainer can hold the whole thing in their head.
- **fflate** for every zip: reading teacher files, cleaning them, writing Word files and the norms zip.
- **ExcelJS** only to _write_ Excel (images, merges, page setup). It is 950 kB, so it is a dynamic import on the
  export screen. Replacing it with hand-written OOXML, like the Word builder, is the main remaining size win.
- **jsPDF + autotable** for PDFs; also a dynamic import.
- **idb-keyval** for storage: two keys, no schema.

## Deployment

Cloudflare Workers Builds from GitHub: `npm run build`, then `npx wrangler deploy` serves `dist/`. Every push to
`main` redeploys. Data is stored per origin, so a user must keep using one address (or move with a backup).
