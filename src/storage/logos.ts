import { get, set } from 'idb-keyval';
import { unzipSync } from 'fflate';
import { DEFAULT_RIGHT_LOGO, DEFAULT_LEFT_LOGO } from './logos-default';

/**
 * The report logos are chosen in "Ajustes del reporte" (or come with a school pack) and are stored in the browser,
 * in the backup file and in the school pack. `logos-default.ts` (generated from assets/logos by `npm run logos`)
 * can bundle a pair of logos for a self-hosted build; a public build ships none.
 */
export interface Logo {
  /** data:image/png;base64,... */
  uri: string;
  width: number;
  height: number;
}
export interface Logos {
  left: Logo | null;
  right: Logo | null;
}

const STORAGE_KEY = 'valedocs:logos';
let custom: Logos = { left: null, right: null };

/** Logos in use: the ones she loaded, otherwise the bundled ones (if this build has any). */
export const getLogos = (): Logos => ({
  left: custom.left ?? DEFAULT_LEFT_LOGO,
  right: custom.right ?? DEFAULT_RIGHT_LOGO,
});

/** Only the logos the user loaded herself (the ones that go into the backup file). */
export const customLogos = (): Logos => custom;

export function base64Of(uri: string): string {
  return uri.slice(uri.indexOf('base64,') + 7);
}
export function imageFormat(uri: string): 'png' | 'jpeg' {
  return /^data:image\/png/i.test(uri) ? 'png' : 'jpeg';
}

function isValidLogo(x: unknown): x is Logo {
  const l = x as Logo | null;
  return (
    !!l && typeof l.uri === 'string' && /^data:image\/(png|jpe?g);base64,/i.test(l.uri) && l.width > 0 && l.height > 0
  );
}

export function validateLogos(x: unknown): Logos | null {
  if (!x || typeof x !== 'object') return null;
  const l = x as Partial<Logos>;
  return { left: isValidLogo(l.left) ? l.left : null, right: isValidLogo(l.right) ? l.right : null };
}

export async function loadLogos(): Promise<void> {
  let stored: Logos | null = null;
  try {
    stored = validateLogos(await get(STORAGE_KEY));
  } catch {
    /* no storage: stays without custom logos */
  }
  if (stored) {
    custom = stored;
    return;
  }
  // First visit of a build that bundles logos: keep them in the browser (and so in backups and school packs),
  // so they survive a later build that ships without them
  if (DEFAULT_LEFT_LOGO || DEFAULT_RIGHT_LOGO) await setLogos({ left: DEFAULT_LEFT_LOGO, right: DEFAULT_RIGHT_LOGO });
}

export async function setLogos(next: Logos): Promise<void> {
  custom = { left: next.left, right: next.right };
  try {
    await set(STORAGE_KEY, custom);
  } catch {
    /* the general save notice already covers this case */
  }
  notifyChange();
}

const listeners = new Set<() => void>();
export function onLogosChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyChange(): void {
  listeners.forEach((f) => f());
}

/** Converts a PNG/JPG image into a logo with its dimensions. */
export function logoFromBlob(blob: Blob): Promise<Logo> {
  return new Promise((ok, fail) => {
    const reader = new FileReader();
    reader.onerror = () => fail(new Error('LOGO'));
    reader.onload = () => {
      const uri = String(reader.result);
      if (!/^data:image\/(png|jpe?g);base64,/i.test(uri)) return fail(new Error('LOGO'));
      const img = new Image();
      img.onload = () => ok({ uri, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => fail(new Error('LOGO'));
      img.src = uri;
    };
    reader.readAsDataURL(blob);
  });
}

/** Extracts the images (logos) from a previous Excel report; the first is the left logo and the second the right one. */
export async function logosFromWorkbook(bytes: Uint8Array): Promise<Logos> {
  const media = unzipSync(bytes, { filter: (f) => /^xl\/media\/[^/]+\.(png|jpe?g)$/i.test(f.name) });
  const names = Object.keys(media).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const images: Logo[] = [];
  for (const n of names.slice(0, 2)) {
    const type = /\.png$/i.test(n) ? 'image/png' : 'image/jpeg';
    images.push(await logoFromBlob(new Blob([media[n] as BlobPart], { type: type })));
  }
  return { left: images[0] ?? null, right: images[1] ?? null };
}
