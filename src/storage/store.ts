import { get, set } from 'idb-keyval';
import { parseMonthKey, weekdaysOf } from '../domain/attendance';
import {
  fitGrades,
  defaultNormsCriteria,
  NORMS_GRADES,
  defaultSettings,
  isWorkshop,
  emptyData,
  newStudent,
  parseTutor,
  type AppData,
  type AttendanceMonth,
  type AttendanceRecord,
  type Gender,
  type NormsCriterion,
  type SchoolClass,
  type Settings,
  type Student,
} from '../domain/model';
import { nameKey } from '../domain/text';
import { setLogos, customLogos, validateLogos, type Logos } from './logos';

const STORAGE_KEY = 'valedocs:data';

let data: AppData = emptyData();
let saveOk = true;
/** Stored data this build cannot read (e.g. saved by a newer version): it is kept untouched, never overwritten. */
let locked = false;
let lockWarned = false;
/** Stored data exists but is not valid: what the app holds is only a placeholder, so a backup of it would be empty. */
let invalidStored = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const notices = new Set<(message: string) => void>();

export const getData = (): AppData => data;
export const savingWorks = (): boolean => saveOk;
export const storedDataUnreadable = (): boolean => locked;
export const backupWouldBeEmpty = (): boolean => invalidStored;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function onNotice(fn: (message: string) => void): void {
  notices.add(fn);
}

/** Keeps only well-formed months (valid "YYYY-MM" key, real Monday-Friday days of that month, no repeats, ascending). */
function cleanMonths(months: unknown): AttendanceMonth[] {
  if (!Array.isArray(months)) return [];
  return (months as { month?: unknown; days?: unknown }[])
    .filter((m) => typeof m?.month === 'string' && parseMonthKey(m.month) !== null && Array.isArray(m.days))
    .filter((m, i, all) => all.findIndex((o) => o.month === m.month) === i) // one entry per month
    .map((m) => {
      const weekdays = new Set(weekdaysOf(m.month as string)); // real Monday-Friday days of that month
      return {
        month: m.month as string,
        days: [...new Set((m.days as unknown[]).filter((d): d is number => weekdays.has(d as number)))].sort(
          (a, b) => a - b,
        ),
      };
    })
    .filter((m) => m.days.length > 0) // a month without school days cannot be opened
    .sort((a, b) => a.month.localeCompare(b.month)); // oldest first, as the views expect
}

/** Keeps the attendance records of known months that have text marks and a text note, fitted to the month's days. */
function cleanAttendance(raw: unknown, months: AttendanceMonth[]): Record<string, AttendanceRecord> {
  const clean: Record<string, AttendanceRecord> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const am of months) {
    const r = (raw as Record<string, Partial<AttendanceRecord> | undefined>)[am.month];
    if (!r || !Array.isArray(r.marks)) continue;
    const marks = am.days.map((_, k) => (typeof r.marks![k] === 'string' ? r.marks![k] : ''));
    clean[am.month] = { marks, note: typeof r.note === 'string' ? r.note : '' };
  }
  return clean;
}

/** Keeps the norms grades of known months as one text per criterion and day, fitted to the month's days. */
function cleanNorms(raw: unknown, months: AttendanceMonth[], criteriaCount: number): Record<string, string[][]> {
  const clean: Record<string, string[][]> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const am of months) {
    const r = (raw as Record<string, unknown>)[am.month];
    if (!Array.isArray(r)) continue;
    clean[am.month] = Array.from({ length: criteriaCount }, (_, i) => {
      const row: unknown = r[i];
      return am.days.map((_, k) => (Array.isArray(row) && NORMS_GRADES.includes(row[k]) ? row[k] : ''));
    });
  }
  return clean;
}

/** Three criteria with a name and one paragraph per grade; anything missing or malformed falls back to the default. */
function cleanCriteria(raw: unknown): NormsCriterion[] {
  const defaults = defaultNormsCriteria();
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  return defaults.map((d, i) => {
    const c = list[i] as Partial<NormsCriterion> | undefined;
    const paragraphs = (saved: unknown, fallback: string[]): string[] =>
      fallback.map((t, k) => (Array.isArray(saved) && typeof saved[k] === 'string' ? (saved[k] as string) : t));
    return {
      name: typeof c?.name === 'string' && c.name.trim() !== '' ? c.name : d.name,
      texts: paragraphs(c?.texts, d.texts),
      textsFemale: paragraphs(c?.textsFemale, d.textsFemale),
    };
  });
}

/** Validates and normalizes data read from disk or from a backup (version 1 to 5; always returns version 5). Returns null if invalid. */
export function validateData(x: unknown): AppData | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Partial<Omit<AppData, 'version'>> & { version?: number };
  if (
    (d.version !== 1 && d.version !== 2 && d.version !== 3 && d.version !== 4 && d.version !== 5) ||
    !d.settings ||
    !Array.isArray(d.classes)
  )
    return null;
  const settings = d.settings;
  if (!Array.isArray(settings.columns) || settings.columns.length === 0 || !Array.isArray(settings.allowedGrades))
    return null;
  for (const c of d.classes) {
    if (typeof c?.id !== 'string' || typeof c.label !== 'string' || !Array.isArray(c.students)) return null;
    for (const a of c.students) if (typeof a?.name !== 'string' || !Array.isArray(a.grades)) return null;
  }
  const clean = x as AppData;
  clean.version = 5;
  clean.settings.uniformNote = typeof clean.settings.uniformNote === 'string' ? clean.settings.uniformNote : '';
  const defaults = defaultSettings();
  clean.settings.normsTitle =
    typeof clean.settings.normsTitle === 'string' && clean.settings.normsTitle.trim() !== ''
      ? clean.settings.normsTitle
      : defaults.normsTitle;
  clean.settings.normsCriteria = cleanCriteria(clean.settings.normsCriteria);
  for (const c of clean.classes) {
    c.tutor = parseTutor(typeof c.tutor === 'string' ? c.tutor : '');
    c.attendanceMonths = cleanMonths(c.attendanceMonths);
    for (const a of c.students) {
      a.note = typeof a.note === 'string' ? a.note : '';
      a.gender = a.gender === 'H' || a.gender === 'M' ? a.gender : '';
      a.workshop = isWorkshop(a.workshop) ? a.workshop : '';
      a.attendance = cleanAttendance(a.attendance, c.attendanceMonths);
      a.norms = cleanNorms(a.norms, c.attendanceMonths, clean.settings.normsCriteria.length);
    }
  }
  fitGrades(clean.classes, clean.settings.columns.length);
  return clean;
}

export async function load(): Promise<void> {
  try {
    const saved = await get(STORAGE_KEY);
    if (saved !== undefined) {
      const valid = validateData(saved);
      if (valid) data = valid;
      else {
        // do not let the next autosave replace data this build cannot read
        locked = true;
        invalidStored = true;
      }
    }
  } catch {
    // Could not even read: the real data may be fine, so do not let an autosave replace it with the empty start
    saveOk = false;
    locked = true;
  }
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not critical */
  }
}

async function saveNow(): Promise<void> {
  if (locked) return;
  try {
    await set(STORAGE_KEY, JSON.parse(JSON.stringify(data)));
    saveOk = true;
  } catch {
    if (saveOk) notices.forEach((f) => f('cannotSave'));
    saveOk = false;
  }
}

/** Applies a change, notifies the views and saves automatically. */
/** Pass `notify = false` to save without re-rendering the views (e.g. a text field the user is leaving). */
export function change(fn: (d: AppData) => void, notify = true): void {
  fn(data);
  if (locked && !lockWarned) {
    // Nothing is saved while locked: say so on whatever screen she is working
    lockWarned = true;
    notices.forEach((f) => f('locked'));
  }
  if (notify) listeners.forEach((f) => f());
  clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), 300);
}

/** Saves immediately (for example when the tab is closed). */
export function flushSave(): Promise<void> {
  clearTimeout(timer);
  return saveNow();
}

/** Deletes one class and everything entered in it. */
export function removeClassById(id: string): void {
  change((d) => (d.classes = d.classes.filter((c) => c.id !== id)));
}

/** Starts from scratch: no classes, default settings and the bundled logos. */
export async function resetAll(): Promise<void> {
  const fresh = emptyData();
  replaceAll(fresh);
  await setLogos({ left: null, right: null });
}

export function replaceAll(next: AppData): void {
  locked = false;
  invalidStored = false;
  lockWarned = false; // she chose to replace everything (backup or start from scratch)
  change((d) => {
    d.settings = next.settings;
    d.classes = next.classes;
  });
}

export function findClass(id: string): SchoolClass | undefined {
  return data.classes.find((c) => c.id === id);
}

/** Backup file: classes, settings and custom logos. */
export function createBackup(): string {
  return JSON.stringify({ ...data, logos: customLogos() }, null, 1);
}

export interface Backup {
  data: AppData;
  logos: Logos | null;
}

export function readBackup(text: string): Backup | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;
    const logos = validateLogos(raw.logos);
    delete raw.logos;
    const validData = validateData(raw);
    return validData ? { data: validData, logos } : null;
  } catch {
    return null;
  }
}

export async function restoreBackup(backupFile: Backup): Promise<void> {
  replaceAll(backupFile.data);
  if (backupFile.logos) await setLogos(backupFile.logos);
}

/** Marks a school pack file so it is never mistaken for a backup (which also holds the classes). */
export const SCHOOL_PACK_KIND = 'valedocs-school-pack';

/** The school's report settings and logos, without any class: what a school shares between its teachers' devices. */
export interface SchoolPack {
  settings: Settings;
  logos: Logos;
}

export function createSchoolPack(): string {
  return JSON.stringify(
    { kind: SCHOOL_PACK_KIND, version: data.version, settings: data.settings, logos: customLogos() },
    null,
    1,
  );
}

/** Reads a school pack (settings are validated like stored data); null if the file is not one. */
export function readSchoolPack(text: string): SchoolPack | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || raw.kind !== SCHOOL_PACK_KIND) return null;
    const valid = validateData({ version: raw.version, settings: raw.settings, classes: [] });
    if (!valid) return null;
    return { settings: valid.settings, logos: validateLogos(raw.logos) ?? { left: null, right: null } };
  } catch {
    return null;
  }
}

/** Replaces the report settings and logos, keeping every class (grades are fitted to the pack's columns). */
export async function applySchoolPack(pack: SchoolPack): Promise<void> {
  change((d) => {
    d.settings = pack.settings;
    fitGrades(d.classes, d.settings.columns.length);
  });
  await setLogos(pack.logos);
}

const key = nameKey;

/** Sets the list of names on a class, keeping the grades, gender and workshop of students who were already there (matched by name). */
export function mergeStudents(
  existingList: Student[],
  names: string[],
  columnCount: number,
  genders: Gender[] = [],
  workshops: string[] = [],
): Student[] {
  const byName = new Map(existingList.map((a) => [key(a.name), a]));
  return names.map((n, i) => {
    const previous = byName.get(key(n));
    const gender = genders[i] ?? '';
    const workshop = workshops[i] ?? '';
    // Gender and workshop she already chose are kept; the file only fills them in when they were empty
    return previous
      ? { ...previous, name: n, gender: previous.gender || gender, workshop: previous.workshop || workshop }
      : newStudent(n, columnCount, gender, workshop);
  });
}
