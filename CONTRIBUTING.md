# Contributing

Thanks for helping. Valedocs is a small app, so most changes are small too; this page says how the code is
organised, what every change must keep true, and what to run before opening a pull request.

## Never commit

- Real student names, teacher workbooks, backups or school packs. Tests build their own workbooks in
  `tests/fixtures.ts` with invented names, and the tests that need a real file read its path from an
  environment variable (`VALEDOCS_TEACHER_FILE`, `VALEDOCS_OWN_FILE`) and are skipped without it.
- A school's name or logos as defaults. A fresh install is generic; a school's identity is typed in
  _Ajustes del reporte_ or loaded from a school pack and stays in the user's browser.
- Google client ids or any secret. `.env.local` is git-ignored; `.env.example` stays empty.

## Setup

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # typecheck, tests, formatting and the import rules; run it before every commit
npm run build    # output in dist/
```

Node 16 or newer (`.node-version` pins 22 for the Cloudflare build; Vite 4 and Vitest 0.34 are pinned so that
Node 16 still works). CI runs `npm run check` and `npm run build` on both.

## The rules every change keeps

How the code is organised, and why, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The look and the UI
rules are in [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). The short version:

1. **The UI is Spanish, the code is English.** Identifiers, comments, file names, CSS classes, routes, storage
   keys, tests and docs are English. Every string the user sees lives in `src/ui/texts.ts` (English keys,
   Spanish values); never inline Spanish in a view. The only Spanish elsewhere is report data (default header
   texts, invented names in tests).
2. **Layers point down.** `domain/` is pure logic with no browser APIs and no imports from other folders. It
   returns codes and data; the views turn them into Spanish messages. `npm run layers` fails when a folder
   imports one it may not (table in `scripts/check-layers.mjs`).
3. **Each report layout is defined once** (`domain/*-layout.ts`) and shared by the Excel, PDF, Word builders and
   the on-screen preview. Change it there, never in one builder.
4. **State changes go through `store.change(...)`**, which notifies the views and autosaves. Edits are validated
   before they are saved; an invalid edit is reverted with a Spanish notice. Data that failed validation
   (`locked`) is never overwritten.
5. **Stored data keeps its field names.** Every new field needs a default in `validateData`, a bump of
   `AppData.version` when the shape changes, and a test that upgrades old data and backups.
6. **Reading teacher files stays cheap.** Use `readNames` (it skips drawings and media). Never load a full
   workbook library on a teacher's file; generate output from scratch.
7. **Heavy libraries are dynamic imports** from the views (`exceljs`, `jspdf`), so the first load stays small.
8. **Dialogs are ours** (`confirmDialog`, `ask`, `dialog` in `ui/dom.ts`), never `window.confirm` or `prompt`.
9. **No very new syntax**: no regex lookbehind, no `structuredClone`; write control characters as escapes. The
   first users' devices may be old (`build.target` is `es2020`).

## Tests

Pure logic is covered with Vitest: `read-names`, `clean`, the builders (round-trip with ExcelJS), store, backup,
merge and validation. A change to `domain/`, `import/` or `storage/` comes with a test. UI flows are checked by
hand in the browser at desktop and phone width (the entry screens have a keyboard grid and a big-button mode).

## Before opening a pull request

- `npm run check` passes.
- You ran the screen you touched at desktop and phone width, and a small tap does not scroll the page back to
  the top (update elements in place or restore `window.scrollY`).
- New visible text has a key in `texts.ts`; new CSS classes are English; new rules that block a download are
  checked again inside the download handler, not only by a disabled button, and skip students with a special
  note.
- The commit subject is short and imperative; details go in bullets.

Issues and pull requests that include real student data are closed and the data is removed from history.
