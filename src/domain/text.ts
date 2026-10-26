/** Dependency-free text utilities shared by import, storage and export. */

/** Removes accents (á → a, ñ → n) so names compare equal however they were typed. */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Collapses repeated spaces and trims both ends. */
export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** File name that is valid on Windows, Mac and Linux. */
export function safeFileName(s: string): string {
  return collapseSpaces(s.replace(/[\\/:*?"<>|]/g, '-'));
}

/** Key for comparing people's names: no accents, no capitals and no extra spaces. */
export function nameKey(s: string): string {
  return stripAccents(collapseSpaces(s)).toLowerCase();
}
