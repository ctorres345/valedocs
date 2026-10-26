# Releasing

How to publish a version of Valedocs. A release is a tag plus a GitHub Release with bilingual notes.
The site updates by itself on every push to `main` (Cloudflare), so a release is only a label and a note.

## Version numbers

`MAJOR.MINOR.PATCH`, like 1.2.3.

- **PATCH** (1.0.1): fixes only, nothing new for the user.
- **MINOR** (1.1.0): a new report, screen or option. Existing data keeps working.
- **MAJOR** (2.0.0): something the user must do, or saved data that cannot be read by the old version.

If `AppData.version` changed, say so in the notes under "Para quien ya lo usa / If you already use it".

## Steps

1. `npm run check` and `npm run build` pass on `main`, and CI is green.
2. Copy the template below into `CHANGELOG.md` (newest version on top) and fill it in. Write what the user
   sees, not what the code does. Keep Spanish first.
3. Bump `version` in `package.json`, commit both files to `main`.
4. On GitHub: Releases, "Draft a new release", tag `vX.Y.Z` on `main`, title `Valedocs X.Y.Z`, paste the same
   text, publish. (The README release badge picks it up.)
5. If saved data changed, open the live site once and check that existing data still loads.

## Template

Paste into `CHANGELOG.md` and into the GitHub Release.

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Español

Una frase: qué trae esta versión y para quién es.

**Novedades**

- Qué puedes hacer ahora que antes no podías.

**Mejoras y arreglos**

- Qué funciona mejor o qué error se corrigió.

**Si ya usabas Valedocs:** qué debes hacer (o "no tienes que hacer nada").

### English

One sentence: what this version brings and who it is for.

**What's new**

- What you can do now that you could not before.

**Improvements and fixes**

- What works better or which bug was fixed.

**If you already use Valedocs:** what you must do (or "nothing to do").

[X.Y.Z]: https://github.com/ctorres345/valedocs/releases/tag/vX.Y.Z
```

Rules for the notes: no student or school names, no screenshots with real data, no technical words in the
Spanish text (say "tus datos", not "IndexedDB"), and every item starts with what the user gains.
