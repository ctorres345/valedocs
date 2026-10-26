// Checks the import rules between the folders of src/ (see docs/ARCHITECTURE.md).
// Usage: node scripts/check-layers.mjs   (part of `npm run check`)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));

/** Folders each folder may import from (besides itself). `main.ts` at the root may import anything. */
const ALLOWED = {
  domain: [],
  storage: ['domain'],
  import: ['domain', 'ui'],
  export: ['domain', 'storage', 'ui'],
  ui: [],
  views: ['domain', 'storage', 'import', 'export', 'ui'],
};

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.ts$/.test(name) ? [path] : [];
  });
}

const problems = [];
for (const file of files(root)) {
  const rel = relative(root, file).split(sep).join('/');
  const folder = rel.includes('/') ? rel.split('/')[0] : null;
  if (!folder) continue; // main.ts
  const allowed = ALLOWED[folder];
  if (!allowed) {
    problems.push(`${rel}: folder "${folder}" is not listed in scripts/check-layers.mjs`);
    continue;
  }
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(/from\s+'([^']+)'|import\(\s*'([^']+)'\s*\)/g)) {
    const target = m[1] ?? m[2];
    if (!target.startsWith('.')) continue; // a library
    const parts = target.split('/');
    const up = parts.filter((p) => p === '..').length;
    if (up === 0) continue; // same folder
    const targetFolder = parts[up];
    if (targetFolder === folder || allowed.includes(targetFolder)) continue;
    problems.push(`${rel} imports from ${targetFolder}/ (${target})`);
  }
}

if (problems.length > 0) {
  console.error('Import rules broken:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('Import rules: ok');
