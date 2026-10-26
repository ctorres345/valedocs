import { unzipSync, zipSync, type Zippable } from 'fflate';

export interface CleanResult {
  bytes: Uint8Array;
  before: number;
  after: number;
  /** Number of invisible shapes removed. */
  removed: number;
}

const ANCHORS = ['oneCellAnchor', 'twoCellAnchor', 'absoluteAnchor'];
const dec = new TextDecoder('utf-8');
const enc = new TextEncoder();

/** A shape is kept if it is an image, a chart or has visible text. */
function isRealContent(anchor: string): boolean {
  if (anchor.includes('<xdr:pic>') || anchor.includes('<xdr:pic ') || anchor.includes('<xdr:graphicFrame')) return true;
  for (const m of anchor.matchAll(/<a:t>([^<]*)<\/a:t>/g)) if (m[1].trim() !== '') return true;
  return false;
}

/** Removes from a drawing every shape that is not an image, chart or text. */
export function cleanDrawing(xml: string): { xml: string; removed: number } {
  const pieces: string[] = [];
  let removed = 0;
  let pos = 0;
  // Next position of each anchor type; only recomputed once it has been passed (avoids rescanning the whole text each time)
  const nextPositions: number[] = ANCHORS.map(() => -2);
  const find = (k: number): number => {
    if (nextPositions[k] === -1 || nextPositions[k] >= pos) return nextPositions[k];
    const re = `<xdr:${ANCHORS[k]}`;
    let i = xml.indexOf(re, pos);
    while (i >= 0 && !/[\s>]/.test(xml[i + re.length])) i = xml.indexOf(re, i + 1);
    return (nextPositions[k] = i);
  };
  for (;;) {
    // Next opening anchor
    let home = -1;
    let tag = '';
    ANCHORS.forEach((t, k) => {
      const i = find(k);
      if (i >= 0 && (home < 0 || i < home)) {
        home = i;
        tag = t;
      }
    });
    if (home < 0) break;
    const closeTag = `</xdr:${tag}>`;
    const end = xml.indexOf(closeTag, home);
    if (end < 0) break;
    const anchorEnd = end + closeTag.length;
    pieces.push(xml.slice(pos, home));
    const anchor = xml.slice(home, anchorEnd);
    if (isRealContent(anchor)) pieces.push(anchor);
    else removed++;
    pos = anchorEnd;
  }
  pieces.push(xml.slice(pos));
  return { xml: pieces.join(''), removed };
}

/** Rewrites an .xlsx without the invisible shapes that make it slow. Keeps sheets, formatting and images. */
export function cleanWorkbook(bytes: Uint8Array): CleanResult {
  const isDrawing = (n: string) => /^xl\/drawings\/[^/]+\.xml$/.test(n);
  // Everything that is not a drawing is read at once; the (huge) drawings are processed one at a time
  const rest = unzipSync(bytes, { filter: (f) => !isDrawing(f.name) });
  const drawingNames: string[] = [];
  unzipSync(bytes, {
    filter: (f) => {
      if (isDrawing(f.name)) drawingNames.push(f.name);
      return false;
    },
  });

  const output: Zippable = {};
  const contentTypes = '[Content_Types].xml';
  if (rest[contentTypes]) output[contentTypes] = [rest[contentTypes], { level: 6 }];
  for (const [name, data] of Object.entries(rest)) {
    if (name === contentTypes) continue;
    output[name] = [data, { level: /\.(png|jpe?g|gif)$/i.test(name) ? 0 : 6 }];
  }

  let removed = 0;
  for (const name of drawingNames) {
    const part = unzipSync(bytes, { filter: (f) => f.name === name })[name];
    const r = cleanDrawing(dec.decode(part));
    removed += r.removed;
    output[name] = [enc.encode(r.xml), { level: 6 }];
  }

  const next = zipSync(output);
  return { bytes: next, before: bytes.length, after: next.length, removed };
}
