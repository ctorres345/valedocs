# valedocs ("Registro de notas")

Small web app, open source (Apache-2.0), born for the maintainer's mother, who helps teachers at a school register grades, and now meant for any teacher with the same job. She imports the student list from a teacher's Excel file, enters her own behaviour grades or the monthly attendance, and exports the report as Excel, PDF or Google Sheets. Public docs: `README.md` (Spanish and English), `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `CONTRIBUTING.md`, `SECURITY.md`.

## People and constraints

- **Maintainer:** Cesar. **First user:** his mother, older, no Excel license, does not read English, easily lost in UIs. Every other teacher is assumed to be like her.
- **UI is Spanish only. Code is English only** (identifiers, comments, file names, CSS classes, routes, storage keys, tests, docs). Every user-visible string lives in `src/ui/texts.ts` (English keys, Spanish values). The only Spanish allowed elsewhere is data that belongs to the report itself (default header text, invented test names).
- Everything must be obvious to a non-technical user: big buttons, a 3-step numbered guide, plain Spanish, no raw technical errors, our own dialogs (not the browser's).
- The repo is **public** (`github.com/ctorres345/valedocs`). Never commit real student names, the teachers' files, backups, school packs, or a school's name or logos as defaults: `defaultSettings()` is generic and the public build bundles no logos (`assets/logos/*.png` are optional, for a self-hosted build; `npm run logos` embeds them or `null`). A school's identity lives in the user's browser, in backups and in the **school pack** (settings + logos, no classes; `createSchoolPack`/`readSchoolPack`/`applySchoolPack` in `storage/store.ts`, buttons in "Ajustes del reporte"). Tests use invented names; the tests that need a real file read `VALEDOCS_TEACHER_FILE` / `VALEDOCS_OWN_FILE` and are skipped without them.

## What it does (decisions already made)

1. **Import names only** from a teacher's workbook (the user picks which sheets/classes she teaches). Drawings are never loaded: the real files hold ~250k invisible shapes and are very slow in Excel.
2. **Print a blank sheet** (PDF) of her report to annotate by hand during the term. It lives under "Más opciones"; it is deliberately not one of the numbered steps. There is one for conduct and one for monthly attendance (she picks the month and its school days; classes need no attendance data).
3. **Enter grades** (conduct report; step 2 of its 3-step guide: Import, Enter grades, Review and download) in the page: keyboard grid on desktop, big touch buttons per column on phones. `AD`/`A`/`B`/`C`, plus a per-student special note (e.g. `TRASLADO AL EXTRANJERO`) that replaces the grades. Autosave, undo, "fill empty with A".
   At the end of the grades screen: if other _selected_ classes still have pending work (incomplete grades or no tutor name, see `pendingOf`), it lists them with a button to complete each one instead of offering step 3; with a single class (or when the others are complete or deselected) it offers step 3.
4. **Preview and export** as `.xlsx`, PDF, or (planned) Google Drive/Sheets. Warns about missing grades.
   4b. **Monthly attendance report** (second report, same imported classes). Per class she opens one or more months (`#/class/:id/attendance`): she picks month and year and unticks days without school (all Monday-Friday days start ticked). Marks per day: `A` Asistió, `T` Tardanza, `F` Faltó, `J` Falta justificada, `U` Tardanza justificada (same letters in cells, buttons, report and summary); a per-student special note replaces the row, like in conduct. Desktop keyboard grid (keys A/T/F/J/U) or, on phones, one day at a time with big buttons. The Observaciones column summarises the non-present marks, e.g. `2T  1F  1J` (zeros omitted; counting rule lives in `summarize`). The report reuses the school/term/tutor texts of the conduct settings, generates the title `MES DE <MES> DEL <AÑO>` and prints the optional `uniformNote` ("BUZO: ...") from "Ajustes del reporte". Columns: N°, TALLER, names, days, Observaciones (no S column). **Taller** is mandatory: each `Student.workshop` holds a code (`IND`, `CARP`, `COMP`, `CONF`, `ELEC`, `WORKSHOPS` in `domain/model.ts`), picked in "Alumnos y datos" among `workshopsFor(label)` (1°-2°: IND/CONF/COMP/ELEC; 3°-5°: CARP/COMP/CONF/ELEC; a label with no year offers all) or read on import from a column headed `TALLER` (code or full name; anything else stays empty). The attendance export is blocked until every student without a special note has one (`studentsMissingWorkshop`); blank sheets are not. Layout replicates her original attendance workbook (see `domain/attendance-layout.ts`). Step 3 of its guide warns about months with unmarked students or no tutor (`pendingMonths`) and about classes with no month.
   4d. **Consolidated absences and tardies** (`#/export/consolidated`, opened from step 3 of the attendance guide). Computed only from the attendance she already marked (no import, no typing): she ticks the months (her last choice is remembered per browser, `valedocs:consolidated-months`; months opened since start ticked) and the classes. Per month it counts `F`, `T`, `J`, `U` (four columns each; zeros blank), then totals `TF TT TJ TU`. Title `CONSOLIDADO DE FALTAS Y TARDANZAS <term>` (term from "Ajustes del reporte"); no tutor, no Taller, no grade. A month's special note is printed merged from that month through the totals. A class without one of the chosen months shows it empty and is warned about. Layout in `domain/consolidated-layout.ts`. Excel: all classes stacked in one sheet with page breaks (default, like her file) or one sheet per class; PDF: one page per class.
   4c. **Monthly norms report** (third report, `#/norms`, one Word/PDF document per student per month; template `attendance_fullfill_report.docx`). Uses the class's `attendanceMonths` (same school days; opening or deleting a month affects both reports; `setMonthDays`/`deleteMonth` keep `Student.norms` in step). Per student she grades each of the 3 criteria (Asistencia y Puntualidad, Presentación personal e higiene, Comportamiento) for every school day with `AD`/`A`/`B`/`C`; entry is per student (`views/norms.ts`: criteria as rows, days as columns on desktop; one day at a time with big buttons on phones). The report never shows the letter: it prints the paragraph of that grade, editable in "Ajustes del reporte" (`Settings.normsCriteria`, defaults in `defaultNormsCriteria()`), in two wordings chosen by the student's gender (`texts` for H, `textsFemale` for M). Gender is picked per student in "Alumnos y datos" (H/M buttons) and is read on import from a column headed `S`, `Sexo` or `Género` (values H/M, Hombre/Mujer; anything else stays empty). It is optional for conduct and attendance; only the norms export needs it and it is blocked until every student who will be exported (at least one grade) has it. Layout (`domain/norms-layout.ts`): one table per Monday-Friday week, unticked weekdays print one merged `FERIADO` cell, weeks without school are left out. Export (`#/export/norms`, one class and month at a time): Word (`export/build-docx.ts`, hand-written OOXML zipped with fflate) or PDF, as one file or a zip with one file per student (`export/norms-files.ts`); students with no grade at all are skipped and listed in the warning. A student with a conduct or attendance special note counts as complete (nothing to grade). Weeks after the first repeat a small caption with the student's name so a page is never anonymous when printed.
5. Extras: "Limpiar archivo lento" (strips invisible shapes from a workbook), backup/restore JSON, school pack (settings + logos) download/load, "start from scratch", delete class, larger-text and day/night toggles (top bar, remembered per browser; night follows the device until she picks), editable header text/columns/logos in "Ajustes del reporte". Logos are optional: with none, the headers print only the texts. On the first visit of a build that bundles logos, `loadLogos` copies them into the browser so they survive a build without them.
6. No sex column in the report. The tutor is stored as a name only; the report prints `TUTOR: NAME` in capitals (same prefix for men and women, like her template; a typed `TUTORA:`/`TUTOR:` prefix is stripped). Two-line column headers (PRESENTACION / PERSONAL) are one cell merged over both header rows. The report layout replicates her original Excel (see `domain/report-layout.ts`).

## Architecture

Static single-page app, Vite + TypeScript, no UI framework, hash routing. All data stays in the browser (IndexedDB via `idb-keyval`). Nothing is uploaded except the optional Drive export.

```
src/
  main.ts          router + startup (hash routes: #/ home, #/steps, #/conduct, #/attendance, #/new, #/class/:id, #/class/:id/details, #/class/:id/attendance[/YYYY-MM], #/class/:id/norms[/YYYY-MM], #/norms, #/export[/attendance|/norms|/consolidated], #/settings, #/cleanup)
  domain/          pure logic, NO browser APIs, no imports from other src folders
                   model, report-layout (conduct report), attendance + attendance-layout (attendance report), validation, text helpers
  storage/         store (IndexedDB, autosave, backup/restore), logos (+ generated logos-default.ts)
  import/          read-names + clean (pure, work on bytes via fflate), worker + worker-client
  export/          build-xlsx (exceljs), build-pdf (jspdf), drive (Google Identity Services)
  ui/              dom helpers/dialogs, texts.ts (ALL Spanish strings), steps banner, styles.css
  views/           one file per screen; each exports xxxView(): View
tests/             Vitest; fixtures.ts builds synthetic teacher workbooks
assets/logos/      source PNGs -> `npm run logos` regenerates src/storage/logos-default.ts
```

### Navigation

- **After importing, the three reports have separate flows.** `#/steps` is the classes screen (import, class cards with details/delete, then big buttons to choose the report). `#/conduct`, `#/attendance` and `#/norms` are each a 3-step guide (`reportView(kind)` in `views/register.ts`, driven by the `REPORTS` table): 1 classes (done), 2 class cards (tutor name, entry button), 3 preview/export (`#/export` conduct, `#/export/attendance` with a month selector).
- **Home (`#/`) is a simple menu**: one big "Registrar notas" entry, then "Más opciones" (blank sheets, settings, cleanup) and backup. Every option has a one-line explanation (`optionRow`).
- Back buttons: grades and the conduct export go back to `#/conduct`; attendance months/entry and the attendance export go back to `#/attendance`; class details, new class and the two guides go back to `#/steps` ("← Volver a mis clases"); `#/steps`, settings and cleanup go to home. Every "next/download" button must open the export of its own report. The top-bar brand always goes home. The end of the export screen has "Volver al inicio" and "Empezar de nuevo" (`views/start-over.ts`).
- Autosave: screens that save by themselves show the green `autosaveBanner()`; do not add "unsaved changes" alerts there. The only place data can be lost is the new-class form, which asks before leaving if something was typed.
- Text fields that save on blur use `change(fn, false)` (no re-render) so the click on the next button is not swallowed.
- Placeholders are examples and start with "Ejemplo:" so they are not mistaken for filled-in data.

### Rules

- `domain/` must not import from `storage/`, `import/`, `export/`, `ui/` or `views/`. Domain functions return codes/data; **views build the Spanish messages** (see `validateNewClass` -> `ClassProblem`). `scripts/check-layers.mjs` (in `npm run check`) enforces the allowed imports between folders; the table is at the top of the script and the reasoning in `docs/ARCHITECTURE.md`.
- Each report layout (headers, widths, file names) is defined once (`domain/report-layout.ts` for conduct, `domain/attendance-layout.ts` for attendance) and shared by Excel, PDF and the on-screen preview. Change it there, not in each builder.
- Reading teacher files must stay cheap: use `readNames` (skips `xl/drawings`, `xl/media`). Never load a full workbook library on a teacher's file. Generate output from scratch; never use her old file as a template.
- Heavy libraries (`exceljs`, `jspdf`) are dynamically imported from the views; keep the first load small.
- State changes go through `store.change(...)` (notifies views, autosaves). Edits are validated before they are saved; invalid edits are reverted with a Spanish notice, never saved.
- New visible text: add a key to `ui/texts.ts`, never inline Spanish in a view. New CSS classes are English.
- Dialogs/confirmations use `ui/dom.ts` helpers (`confirmDialog`, `ask`, `dialog`), not `window.confirm/prompt`.
- Duplicates: classes compare by year+section (`sameClass`), people by `nameKey` (no accents/case/extra spaces).
- Keep data-model field names stable; stored data and backups depend on them (`AppData.version`, now 5: v5 added `Student.workshop`; v4 added `Student.gender` ('H' | 'M' | '') and `NormsCriterion.textsFemale`; v2 added `Student.attendance`, `SchoolClass.attendanceMonths`, `Settings.uniformNote`; v3 added `Student.norms`, `Settings.normsTitle`, `Settings.normsCriteria`; `validateData` upgrades v1/v2 data and backups). Stored data that fails validation (or comes from a newer version) is never overwritten: `load()` locks saving and the screens show a warning (`views/saving-banner.ts`). If you must change them, write a migration.
- Attendance is stored per student by month key (`attendance['2026-09'] = { marks, note }`, one mark per day of the class's `attendanceMonths` entry); change a month's days only through `setMonthDays` so marks of the days that stay are kept.

## Commands

```bash
npm run dev      # http://localhost:5173
npm run check    # tsc + vitest + prettier --check + import rules  (run before every commit)
npm run layers   # only the import rules (scripts/check-layers.mjs)
npm run format   # prettier --write
npm run logos    # regenerate src/storage/logos-default.ts from assets/logos
npm run build    # output in dist/
```

The maintainer's machine runs Node 24; Vite 4 / Vitest 0.34 are kept so Node 16 still works (CI tests it), so scripts must not use Node 17+ APIs (`structuredClone`, etc.) and must build paths with `fileURLToPath`, never `URL.pathname` (breaks on Windows). Wrangler 4 needs Node 22, so deploys cannot be run locally (see below). Cloudflare builds with Node 22 (`.node-version`). CI (`.github/workflows/ci.yml`) runs `npm run check` and `npm run build` on Node 16 and 22.

## Testing

- Pure logic is covered with Vitest: `read-names`, `clean`, builders (round-trip with exceljs), store/backup/merge, validation. Add a test with every change to `domain/`, `import/` or `storage/`.
- Real files may exist locally; point `VALEDOCS_TEACHER_FILE` and `VALEDOCS_OWN_FILE` at them to run the tests that use them (skipped otherwise). Never copy them into the repo.
- Attendance has tests in `attendance.test.ts` (months, summary, pending) and `attendance-build.test.ts` (layout, Excel round-trip, PDF pages).
- UI flows were verified manually in the browser pane (desktop and phone width). When changing a view, run it and check the flow, including the phone layout.
- Test fixtures must use invented names.

## Deployment

- Cloudflare Workers Builds from the repo; `wrangler.jsonc` serves `dist/`. Build command `npm run build`, deploy command `npx wrangler deploy`. Every push to `main` redeploys. Live: https://valedocs.cjtech.dev (custom domain set in `wrangler.jsonc`; the old `*.workers.dev` address keeps working, but data is stored per address, so each user must stick to one).
- Check a build without logging in to Cloudflare: `gh api repos/ctorres345/valedocs/commits/main/check-runs --jq '.check_runs[] | {name,status,conclusion}'`.
- The Cloudflare connector (MCP) only lists workers; it cannot show build logs or URLs.

## Open TODOs

- [ ] **Google Drive export** (button is hidden until configured). Free: the Drive API has no charge for normal use, and `drive.file` is a non-sensitive scope. Steps (also in README): create a Google Cloud project, enable Drive API, configure the OAuth consent screen (External), add the user's Gmail as a **test user**, create an OAuth client ID of type "Web application" with `https://valedocs.cjtech.dev` and `http://localhost:5173` as authorised origins, then set `VITE_GOOGLE_CLIENT_ID` in Cloudflare (Variables) and `.env.local`. Expect Google's "app not verified" warning screen in testing mode: do the first sign-in with her, or do the basic verification. Then test the upload end to end.
- [ ] Try a real teacher file on the live site with her.
- [ ] Optional refactors still deferred: `views/export-report.ts` still branches on conduct/attendance (the guide in `views/register.ts` already uses the `REPORTS` table); de-duplicate the Excel/PDF builders. Done: mode/undo/keyboard shared in `views/grid-keys.ts`.
- [ ] Optional: `views/grades.ts` is the largest file (~375 lines); split rendering from keyboard handling if it grows.

## Claude Code usage

Useful agents and skills for this project:

- **`/simplify`** after a feature: reuse, dead code, duplication (it found real duplication earlier). **`/code-review`** before merging bigger changes. **`/security-review`** before enabling Drive (OAuth, token handling, file upload). Before merging, also review the diff and consult the advisor.
- **`/run`** (or the browser pane with `npm run dev`) to verify a UI change in the real app, at desktop and phone width.
- **`xlsx` / `pdf` skills** to inspect generated Excel/PDF output or a teacher's file. Note that the browser pane cannot display PDFs; render them with pdf.js on a canvas.
- **Agents:** `Explore` for broad searches, `Plan` for designing a multi-file change, `claude-code-guide` for questions about Claude Code itself. For this small code base most work is better done directly.
- Ideas if the workflow grows: a project skill for "add a visible text" or "add a view" following the rules above, and a hook running `npm run check` before commits. Neither exists yet.
- Local-only files are git-ignored: `.claude/settings.local.json`, `.env.local`. `.claude/launch.json` (dev server config) is committed.

## Lessons from code reviews (check these before opening a PR)

- **Scroll jumps:** never rebuild a long list or a whole screen on a small tap (it sent her back to the top three times). Update the touched elements in place, or restore `window.scrollY` after `render()`.
- **Shared months:** attendance and norms share `attendanceMonths`. Any action on a month (`setMonthDays`, `deleteMonth`, undo snapshots, dialog texts) must keep every report's data in step.
- **Stored data:** every new field needs validation/cleaning in `validateData`, a migration and a test. Never let an autosave replace data that could not be read (`locked`); say so on every screen she can edit.
- **Exports:** respect the per-class "include" selection, open on the class/month she was just working on, never block on students who are not exported, and repeat the student's identity on every printed page.
- **Special notes** (transfer, left the school) count as complete in every report; a pending student who cannot be graded must not block a download.
- **Import:** do not guess ambiguous codes (a gender column with F/V or Masculino is ignored); scan only the header rows, take the first match.
- **Browser support:** no regex lookbehind or other very new syntax (her device may be old); write control/special characters as escapes, never literally.
- **Mandatory fields:** a rule that blocks a download must be checked again inside `run()`, not only by disabled buttons, and must skip students with any special note (conduct or attendance) and classes without the chosen month. New mandatory data hits existing saved data: say so to Cesar, since her already-filled months get blocked until she fills it in.
- **CSS order:** a new desktop rule placed after the phone media query overrides it; declare base rules before the `@media` block.
- **Fields that depend on the class label** (workshops by grade): filter imported values against what the class offers; a stale value she chose stays selected, never silently cleared.
- **Process:** one entry-screen scaffolding is copied in `grades.ts`, `attendance.ts` and `norms.ts` (see Open TODOs); fix a bug in all three or do the refactor.

## Conventions

- Prettier (`.prettierrc`: 120 cols, single quotes, trailing commas); LF line endings (`.gitattributes`).
- Commits: short imperative subject, bullets for details. End with the attribution line configured for the session.
- Don't add planning/analysis documents to the repo; keep decisions in this file, the README or `docs/`.
- Logo (Vale's paw on a sheet) and every icon/promo image: `public/favicon.svg` is the source; the list of files is in `docs/DESIGN_SYSTEM.md` ("Logo and images"). Regenerate them all after changing the logo.
- Screenshots in `docs/screenshots/` are taken with Playwright on invented data (a seed script in the thread that made them); retake them after a visual change, never with real names.
