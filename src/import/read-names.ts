import { unzipSync } from 'fflate';
import { normalizedLabel, cleanName, WORKSHOPS, workshopsFor, type Gender } from '../domain/model';
import { collapseSpaces, stripAccents } from '../domain/text';

export interface ImportedClass {
  /** Sheet name exactly as it appears in the workbook. */
  sheet: string;
  label: string;
  names: string[];
  /** Same order as `names`; '' when the sheet has no gender column or the cell is empty. */
  genders: Gender[];
  /** Same order as `names`: workshop code, or '' when the sheet has no TALLER column or the cell is unknown. */
  workshops: string[];
}

const dec = new TextDecoder('utf-8');

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/** Joins the content of every <t> in a fragment (plain text or mixed formatting). */
function textOf(fragment: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out += decodeXml(m[1]);
  return out;
}

function readSharedStrings(xml: string): string[] {
  const res: string[] = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) res.push(m[1] ? textOf(m[1]) : '');
  return res;
}

function columnToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

type Cells = Map<number, Map<number, string>>; // row → column → text

function readSheet(xml: string, sharedStrings: string[]): Cells {
  const rows: Cells = new Map();
  const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(xml))) {
    const attrs = m[1];
    const body = m[2];
    if (!body) continue;
    const ref = /\br="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue;
    const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
    let text = '';
    if (type === 'inlineStr') {
      text = textOf(body);
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (v === undefined) continue;
      text = type === 's' ? (sharedStrings[parseInt(v, 10)] ?? '') : decodeXml(v);
    }
    if (text === '') continue;
    const row = parseInt(ref[2], 10);
    const col = columnToNumber(ref[1]);
    let f = rows.get(row);
    if (!f) rows.set(row, (f = new Map()));
    f.set(col, text);
  }
  return rows;
}

const normalizeText = (s: string): string => collapseSpaces(stripAccents(s).toUpperCase());

function isNamesHeader(s: string): boolean {
  const n = normalizeText(s);
  return n.includes('APELLIDOS') && n.includes('NOMBRES');
}

/** Header texts that name the gender column ("S" in the teachers' files). */
const GENDER_HEADERS = new Set(['S', 'SEXO', 'GENERO']);

/** Codes of other conventions (Masculino/Femenino, Varón): a column using them is not read at all. */
const OTHER_GENDER_CODES = new Set(['F', 'V', 'MASCULINO', 'FEMENINO', 'VARON']);

/** H or M (also written Hombre / Mujer); anything else is left empty so she picks it by hand. */
function readGender(text: string): Gender {
  const n = normalizeText(text);
  return n === 'H' || n === 'HOMBRE' ? 'H' : n === 'M' || n === 'MUJER' ? 'M' : '';
}

/** Header of the workshop column. */
const WORKSHOP_HEADERS = new Set(['TALLER']);

/** Full names that also identify a workshop code (the codes themselves are matched directly). */
const WORKSHOP_NAMES: Record<string, string> = {
  'INDUSTRIA ALIMENTARIA': 'IND',
  CARPINTERIA: 'CARP',
  COMPUTACION: 'COMP',
  CONFECCIONES: 'CONF',
  ELECTRICIDAD: 'ELEC',
};

/** A workshop code, written as the code or as the full name; anything else is left empty so she picks it by hand. */
function readWorkshop(text: string): string {
  const n = normalizeText(text);
  return WORKSHOPS.includes(n) ? n : (WORKSHOP_NAMES[n] ?? '');
}

/** Extracts the student list from a sheet; returns null if it finds no names table. */
export function extractClass(sheet: string, cells: Cells): ImportedClass | null {
  const sortedRows = [...cells.keys()].sort((a, b) => a - b);

  // 1. "APELLIDOS Y NOMBRES" header
  let headerRow = -1;
  let nameCol = -1;
  for (const f of sortedRows) {
    for (const [c, t] of cells.get(f)!) {
      if (isNamesHeader(t)) {
        headerRow = f;
        nameCol = c;
        break;
      }
    }
    if (headerRow >= 0) break;
  }
  if (headerRow < 0) return null;

  // Number column: the "N°" header cell; if missing, the one right next to the name column
  let numberCol = nameCol - 1;
  for (const [c, t] of cells.get(headerRow)!) {
    if (c < nameCol && /^N(?:RO|O)?[°º.]?$/.test(normalizeText(t).replace(/[°º]/g, '°'))) numberCol = c;
  }
  const cell = (f: number, c: number): string => cells.get(f)?.get(c) ?? '';
  const isNumber = (s: string): boolean => /^\d+$/.test(s.trim());

  // 2. Skip the second header row (merged cells) up to the first name
  let row = headerRow + 1;
  const skipLimit = headerRow + 4;
  while (row <= skipLimit && cell(row, nameCol) === '') row++;
  if (cell(row, nameCol) === '') return null;

  // 3. Read while there is a name; stop if the N° stops being numeric (another block)
  // Gender column: a header "S" / "Sexo" / "Género" in the header rows (the second one can hold merged cells)
  let genderCol = -1;
  for (let f = headerRow; f <= headerRow + 3 && f < row && genderCol < 0; f++) {
    for (const [c, t] of cells.get(f) ?? []) {
      if (genderCol < 0 && c !== nameCol && c !== numberCol && GENDER_HEADERS.has(normalizeText(t))) genderCol = c;
    }
  }

  // Workshop column: a header "TALLER", looked up like the gender column
  let workshopCol = -1;
  for (let f = headerRow; f <= headerRow + 3 && f < row && workshopCol < 0; f++) {
    for (const [c, t] of cells.get(f) ?? []) {
      if (workshopCol < 0 && c !== nameCol && c !== numberCol && WORKSHOP_HEADERS.has(normalizeText(t)))
        workshopCol = c;
    }
  }

  const names: string[] = [];
  const genders: Gender[] = [];
  const workshops: string[] = [];
  let otherCodes = false;
  for (; ; row++) {
    const name = cleanName(cell(row, nameCol));
    if (name === '') break;
    const num = cell(row, numberCol);
    if (num !== '' && !isNumber(num)) break;
    names.push(name);
    genders.push(genderCol < 0 ? '' : readGender(cell(row, genderCol)));
    workshops.push(workshopCol < 0 ? '' : readWorkshop(cell(row, workshopCol)));
    if (genderCol >= 0 && OTHER_GENDER_CODES.has(normalizeText(cell(row, genderCol)))) otherCodes = true;
  }
  if (names.length === 0) return null;
  // M/F or V/H files: "M" would not mean Mujer, so the whole column is ignored rather than guessed
  if (otherCodes) genders.fill('');

  // 4. Class label: a cell with "SECUNDARIA"/"PRIMARIA" near the top, or the sheet name
  let classText = '';
  for (const f of sortedRows) {
    if (f >= headerRow) break;
    for (const t of cells.get(f)!.values()) {
      if (/SECUNDARIA|PRIMARIA/i.test(t) && /\d/.test(t)) {
        classText = t;
        break;
      }
    }
    if (classText) break;
  }
  const label = normalizedLabel(classText || sheet);
  // A code the class does not offer (e.g. CARP in 1st grade) is left for her to pick
  const offered = workshopsFor(label);
  return { sheet, label, names, genders, workshops: workshops.map((w) => (offered.includes(w) ? w : '')) };
}

/** Reads an .xlsx workbook skipping drawings and images (which are what make it slow). */
export function readNames(bytes: Uint8Array): ImportedClass[] {
  const parts = unzipSync(bytes, {
    filter: (f) =>
      f.name === 'xl/workbook.xml' ||
      f.name === 'xl/_rels/workbook.xml.rels' ||
      f.name === 'xl/sharedStrings.xml' ||
      /^xl\/worksheets\/[^/]+\.xml$/.test(f.name),
  });
  const wb = parts['xl/workbook.xml'];
  if (!wb) throw new Error('NOT_EXCEL');

  const sharedStrings = parts['xl/sharedStrings.xml']
    ? readSharedStrings(dec.decode(parts['xl/sharedStrings.xml']))
    : [];

  const rels = new Map<string, string>();
  const relsXml = parts['xl/_rels/workbook.xml.rels'] ? dec.decode(parts['xl/_rels/workbook.xml.rels']) : '';
  for (const m of relsXml.matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
    const id = /\bId="([^"]*)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(m[1])?.[1];
    if (id && target) rels.set(id, target);
  }

  const result: ImportedClass[] = [];
  const wbXml = dec.decode(wb);
  for (const m of wbXml.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
    const name = decodeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? '');
    const rid = /\br:id="([^"]*)"/.exec(m[1])?.[1];
    const status = /\bstate="([^"]*)"/.exec(m[1])?.[1];
    if (!rid || status === 'hidden' || status === 'veryHidden') continue;
    let target = rels.get(rid);
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const data = parts[target];
    if (!data) continue;
    const schoolClass = extractClass(name, readSheet(dec.decode(data), sharedStrings));
    if (schoolClass) result.push(schoolClass);
  }
  return result;
}
