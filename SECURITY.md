# Security policy

## Supported versions

Security fixes go into the current `main` branch, which is what https://valedocs.cjtech.dev serves. There are no
numbered releases to backport to.

## Reporting a vulnerability

Report privately with **Report a vulnerability** in the repository's **Security** tab. Do not open a public issue
or pull request about it.

In the report, say what an attacker can do, the steps or input that show it, which browser you used, and a fix if
you have one.

Leave out of the report, its logs and its examples:

- Real teacher files, backups or school packs, and anything with real student names, grades or attendance. If the
  problem needs a crafted file, describe it or give a small script that builds it from scratch, the way
  `tests/fixtures.ts` does.
- Local paths that name you or your machine.
- Google OAuth client ids, access tokens, cookies, and any key or password.

The maintainer will acknowledge the report, work out its scope, and agree with you on a fix and on when to disclose
it.

## Security boundary

Valedocs is a static site. Everything a user enters stays in their browser (IndexedDB and localStorage) and in the
files they download; nothing is sent to a server. The only network calls are the optional Google Drive export
(the user's own account, scope `drive.file`, only when a client id is configured) and the Google script it loads.
Files the user opens (teacher workbooks, backups, school packs) are untrusted input: they are parsed with our own
readers and validated before anything is stored.
