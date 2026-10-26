import { monthTitle, summarize } from './attendance';
import { formatTutor, type AttendanceMonth, type SchoolClass, type Settings } from './model';

/**
 * Single description of the attendance report. Excel, PDF and the on-screen preview read from here,
 * like `report-layout.ts` does for the conduct report. Shared headers live there too (N°, names).
 */
export const OBSERVATIONS_HEADER = 'OBSERVACIONES';
export const WORKSHOP_HEADER = 'TALLER';

export const WORKSHOP_WIDTH = 7;
export const ATTENDANCE_NAME_WIDTH = 38;
export const DAY_WIDTH = 3.6;
export const OBSERVATIONS_WIDTH = 14;

export interface AttendanceRow {
  position: number;
  name: string;
  /** Workshop code (CARP, COMP...); empty only for a student with a special note. */
  workshop: string;
  /** One mark per entry of `days`. */
  marks: string[];
  note: string;
  /** Observaciones text, e.g. "2T  1F". */
  summary: string;
}

export interface AttendanceReport {
  institution1: string;
  institution2: string;
  term: string;
  uniformNote: string;
  label: string;
  tutor: string;
  title: string;
  /** School days of the month (at least one). */
  days: number[];
  rows: AttendanceRow[];
}

/** Builds the content of one class month; with `blank` the marks are empty (to print and fill in by hand). */
export function buildAttendanceReport(
  schoolClass: SchoolClass,
  settings: Settings,
  month: AttendanceMonth,
  blank: boolean,
): AttendanceReport {
  return {
    institution1: settings.institution1,
    institution2: settings.institution2,
    term: settings.term,
    uniformNote: settings.uniformNote.trim(),
    label: schoolClass.label,
    tutor: formatTutor(schoolClass),
    title: monthTitle(month.month),
    days: [...month.days],
    rows: schoolClass.students.map((s, i) => {
      const r = blank ? undefined : s.attendance[month.month];
      const marks = month.days.map((_, k) => r?.marks[k] ?? '');
      const note = (r?.note ?? '').trim();
      return {
        position: i + 1,
        name: s.name,
        workshop: s.workshop,
        marks,
        note,
        summary: note === '' ? summarize(marks) : '',
      };
    }),
  };
}

/** Students with unmarked days (used to warn before exporting). */
export function incompleteAttendanceRows(r: AttendanceReport): AttendanceRow[] {
  return r.rows.filter((f) => f.note === '' && f.marks.some((m) => m === ''));
}

/** Where the month title and the tutor go in the row above the table: the title takes the left half of the days. */
export function titleSplit(dayCount: number): { titleEnd: number; lastCol: number } {
  return { titleEnd: 3 + Math.ceil(dayCount / 2), lastCol: 4 + dayCount };
}
