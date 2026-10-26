import { shortName, type Settings, type SchoolClass, formatTutor } from './model';
import { safeFileName } from './text';

/**
 * Single description of the report. The three outputs (Excel, PDF and on-screen preview)
 * read from here, so all three look the same.
 */
export const NUMBER_HEADER = 'N°';
export const NAME_HEADER = 'APELLIDOS Y NOMBRES';

export const NUMBER_WIDTH = 5;
export const NAME_WIDTH = 44;
export const GRADE_WIDTH = 17;

export interface StudentRow {
  position: number;
  name: string;
  grades: string[];
  note: string;
}

export interface Report {
  institution1: string;
  institution2: string;
  title1: string;
  title2: string;
  term: string;
  label: string;
  tutor: string;
  columns: { line1: string; line2: string }[];
  rows: StudentRow[];
}

/** Builds the content of a report; with `blank` the grades are empty (to print and fill in by hand). */
export function buildReport(schoolClass: SchoolClass, settings: Settings, blank: boolean): Report {
  const n = settings.columns.length;
  return {
    institution1: settings.institution1,
    institution2: settings.institution2,
    title1: settings.title1,
    title2: settings.title2,
    term: settings.term,
    label: schoolClass.label,
    tutor: formatTutor(schoolClass),
    columns: settings.columns.map((c) => ({ ...c })),
    rows: schoolClass.students.map((a, i) => ({
      position: i + 1,
      name: a.name,
      grades: blank ? Array.from({ length: n }, () => '') : Array.from({ length: n }, (_, k) => a.grades[k] ?? ''),
      note: blank ? '' : a.note.trim(),
    })),
  };
}

/** Students with missing grades (used to warn before exporting). */
export function incompleteRows(r: Report): StudentRow[] {
  return r.rows.filter((f) => f.note === '' && f.grades.some((x) => x === ''));
}

/** File name for exporting one or several classes, e.g. "Reporte 5°A - II TRIMESTRE - 2026". */
export function baseFileName(prefix: string, classes: SchoolClass[], term: string): string {
  const detail = classes.length === 1 ? `${shortName(classes[0].label)} - ${term}` : term;
  return safeFileName(`${prefix} ${detail}`);
}

/** Header text of a grade column: one merged cell spanning both header rows, with the two lines stacked. */
export function columnHeader(c: { line1: string; line2: string }): string {
  return c.line2.trim() === ''
    ? c.line1
    : `${c.line1}
${c.line2}`;
}
