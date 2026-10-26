import {
  cleanName,
  type AttendanceMonth,
  type AttendanceRecord,
  type MonthKey,
  type SchoolClass,
  type Student,
} from './model';

/** Marks she can enter for one school day, in the order they are offered. */
export const ATTENDANCE_CODES = ['A', 'T', 'F', 'J', 'U'] as const;

/** Codes counted in the Observaciones summary (a present day is not counted), in print order. */
const SUMMARY_CODES = ['T', 'F', 'J', 'U'];

/** Month names as printed on her report (she writes "SETIEMBRE"). */
const MONTH_NAMES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SETIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Year and month (1-12) of a key; null if it is not "YYYY-MM". */
export function parseMonthKey(key: MonthKey): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

/** Report title of a month, e.g. "MES DE SETIEMBRE DEL 2026". */
export function monthTitle(key: MonthKey): string {
  const p = parseMonthKey(key);
  return p ? `MES DE ${MONTH_NAMES[p.month - 1]} DEL ${p.year}` : '';
}

/** Month name as printed in a column header, e.g. "SETIEMBRE"; empty if the key is invalid. */
export function monthHeader(key: MonthKey): string {
  const p = parseMonthKey(key);
  return p ? MONTH_NAMES[p.month - 1] : '';
}

/** The 12 month names in Title case ("Setiembre"), January first. */
export const monthLabels = (): string[] => MONTH_NAMES.map((n) => `${n[0]}${n.slice(1).toLowerCase()}`);

/** Name of the month with its year, e.g. "Setiembre 2026", for lists and file names. */
export function monthName(key: MonthKey): string {
  const p = parseMonthKey(key);
  if (!p) return '';
  return `${monthLabels()[p.month - 1]} ${p.year}`;
}

/** Monday-to-Friday day numbers of a month. */
export function weekdaysOf(key: MonthKey): number[] {
  const p = parseMonthKey(key);
  if (!p) return [];
  const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  const days: number[] = [];
  for (let d = 1; d <= last; d++) {
    const weekday = new Date(Date.UTC(p.year, p.month - 1, d)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d);
  }
  return days;
}

/** Weekday of a day of the month, 1 = Monday ... 5 = Friday (0 for a weekend). */
export function weekdayOf(key: MonthKey, day: number): number {
  const p = parseMonthKey(key);
  if (!p) return 0;
  const w = new Date(Date.UTC(p.year, p.month - 1, day)).getUTCDay();
  return w >= 1 && w <= 5 ? w : 0;
}

/** Observaciones text: how many of each non-present mark, e.g. "2T  1F  1J"; empty when there are none. */
export function summarize(marks: string[]): string {
  return SUMMARY_CODES.map((code) => [code, marks.filter((m) => m === code).length] as const)
    .filter(([, n]) => n > 0)
    .map(([code, n]) => `${n}${code}`)
    .join('  ');
}

export const findMonth = (c: SchoolClass, key: MonthKey): AttendanceMonth | undefined =>
  c.attendanceMonths.find((m) => m.month === key);

/** Classes that have the month opened, paired with that month. */
export function classesWithMonth(
  classes: SchoolClass[],
  month: string,
): { schoolClass: SchoolClass; month: AttendanceMonth }[] {
  return classes.flatMap((schoolClass) => {
    const am = findMonth(schoolClass, month);
    return am ? [{ schoolClass, month: am }] : [];
  });
}

/** The student's record for a month, created (or fitted to the month's days) when missing. */
export function recordOf(s: Student, am: AttendanceMonth): AttendanceRecord {
  const r = (s.attendance[am.month] ??= { marks: [], note: '' });
  while (r.marks.length < am.days.length) r.marks.push('');
  r.marks.length = am.days.length;
  return r;
}

/** Opens a month for a class, or changes its school days keeping the marks and norms grades of the days that stay. */
export function setMonthDays(c: SchoolClass, key: MonthKey, days: number[]): void {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const old = findMonth(c, key);
  if (old) {
    const remap = <T>(values: T[], empty: T): T[] => {
      const byDay = new Map(old.days.map((d, i) => [d, values[i] ?? empty]));
      return sorted.map((d) => byDay.get(d) ?? empty);
    };
    for (const s of c.students) {
      const r = s.attendance[key];
      if (r) r.marks = remap(r.marks, '');
      const n = s.norms[key];
      if (n) s.norms[key] = n.map((row) => remap(row, ''));
    }
    old.days = sorted;
  } else {
    c.attendanceMonths.push({ month: key, days: sorted });
    c.attendanceMonths.sort((a, b) => a.month.localeCompare(b.month));
  }
}

/** Removes a month from a class together with everything entered in it (attendance and norms). */
export function deleteMonth(c: SchoolClass, key: MonthKey): void {
  c.attendanceMonths = c.attendanceMonths.filter((m) => m.month !== key);
  for (const s of c.students) {
    delete s.attendance[key];
    delete s.norms[key];
  }
}

/** Complete when she wrote a special note or marked every school day. */
export function isAttendanceComplete(s: Student, am: AttendanceMonth): boolean {
  const r = s.attendance[am.month];
  if (!r) return am.days.length === 0;
  return r.note.trim() !== '' || (r.marks.length === am.days.length && r.marks.every((m) => m !== ''));
}

/** A class is done when it has at least one month and every student is complete in every month. */
export function isClassAttendanceComplete(c: SchoolClass): boolean {
  return (
    c.attendanceMonths.length > 0 &&
    c.attendanceMonths.every((am) => c.students.every((s) => isAttendanceComplete(s, am)))
  );
}

export interface PendingMonth {
  schoolClass: SchoolClass;
  month: AttendanceMonth;
  pending: AttendancePending;
}

/** Says whether a student has finished a month of one report (attendance marks or norms grades). */
export type MonthDone = (s: Student, am: AttendanceMonth) => boolean;

/** Every opened month that still has unfinished students or no tutor name, in class and month order. */
export function pendingMonths(classes: SchoolClass[], isDone: MonthDone = isAttendanceComplete): PendingMonth[] {
  return classes.flatMap((schoolClass) =>
    schoolClass.attendanceMonths.flatMap((month) => {
      const pending = attendancePendingOf(schoolClass, month, isDone);
      return pending ? [{ schoolClass, month, pending }] : [];
    }),
  );
}

export interface AttendancePending {
  incompleteStudents: number;
  missingTutor: boolean;
}

/** What is still missing in a class month before its report is final; null when nothing is missing. */
export function attendancePendingOf(
  c: SchoolClass,
  am: AttendanceMonth,
  isDone: MonthDone = isAttendanceComplete,
): AttendancePending | null {
  const incompleteStudents = c.students.filter((s) => !isDone(s, am)).length;
  const missingTutor = cleanName(c.tutor) === '';
  return incompleteStudents === 0 && !missingTutor ? null : { incompleteStudents, missingTutor };
}

/** Students who need a workshop in at least one opened month of the class (what blocks its attendance export). */
export function studentsMissingWorkshopAnyMonth(c: SchoolClass): Student[] {
  const missing = new Set(c.attendanceMonths.flatMap((am) => studentsMissingWorkshop(c, am)));
  return c.students.filter((s) => missing.has(s));
}

/** Students who still need a workshop in the report of this month; a student with a special note (attendance or conduct) has nothing to show. */
export function studentsMissingWorkshop(c: SchoolClass, am: AttendanceMonth): Student[] {
  return c.students.filter(
    (s) => s.workshop === '' && s.note.trim() === '' && (s.attendance[am.month]?.note ?? '').trim() === '',
  );
}
