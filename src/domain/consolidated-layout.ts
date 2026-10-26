import { findMonth, monthHeader } from './attendance';
import type { MonthKey, SchoolClass, Settings } from './model';

/**
 * Single description of the consolidated absences and tardies report (one block per class, a group of count
 * columns per chosen month, then the totals). Excel, PDF and the on-screen preview read from here.
 */
export const CONSOLIDATED_TITLE = 'CONSOLIDADO DE FALTAS Y TARDANZAS';
export const CONSOLIDATED_GROUP_HEADER = 'ASISTENCIA Y PUNTUALIDAD';
export const TOTAL_HEADER = 'TOTAL';

/** Marks counted per month, in column order: Faltó, Tardanza, Falta justificada, Tardanza justificada. */
export const COUNTED_CODES = ['F', 'T', 'J', 'U'] as const;
/** Headers of the total columns, in the same order (TF = total de faltas...). */
export const TOTAL_CODES = COUNTED_CODES.map((c) => `T${c}`);

export const COUNT_WIDTH = 4.2;
export const CONSOLIDATED_NAME_WIDTH = 40;

export interface ConsolidatedRow {
  position: number;
  name: string;
  /** Per chosen month, one count per `COUNTED_CODES` entry; null when the class does not have that month. */
  counts: (number[] | null)[];
  /** Sum of the months shown before the note (one per `COUNTED_CODES` entry). */
  totals: number[];
  /** Special note of the first month that has one (e.g. TRASLADO); it replaces that month and every column after it. */
  note: string;
  /** Index of the month where the note starts; equals the number of months when there is no note. */
  noteFrom: number;
}

export interface ConsolidatedReport {
  institution1: string;
  institution2: string;
  title: string;
  label: string;
  /** Column headers of the chosen months, e.g. "JUNIO". */
  months: string[];
  rows: ConsolidatedRow[];
}

/** How many of each counted mark a month has (unmarked days and present days count nothing). */
export function countMarks(marks: string[]): number[] {
  return COUNTED_CODES.map((code) => marks.filter((m) => m === code).length);
}

/** Builds the block of one class for the chosen months (sorted oldest first); months the class lacks stay empty. */
export function buildConsolidatedReport(
  schoolClass: SchoolClass,
  settings: Settings,
  months: MonthKey[],
): ConsolidatedReport {
  const keys = [...months].sort();
  const opened = keys.map((k) => findMonth(schoolClass, k));
  return {
    institution1: settings.institution1,
    institution2: settings.institution2,
    title: `${CONSOLIDATED_TITLE} ${settings.term}`.trim(),
    label: schoolClass.label,
    months: keys.map(monthHeader),
    rows: schoolClass.students.map((s, i) => {
      const records = keys.map((k, m) => (opened[m] ? s.attendance[k] : undefined));
      const found = records.findIndex((r) => (r?.note ?? '').trim() !== '');
      const noteFrom = found < 0 ? keys.length : found;
      const counts = opened.map((am, m) => (am && m < noteFrom ? countMarks(records[m]?.marks ?? []) : null));
      const totals = COUNTED_CODES.map((_, k) => counts.reduce((sum, c) => sum + (c ? c[k] : 0), 0));
      return {
        position: i + 1,
        name: s.name,
        counts,
        totals,
        note: found < 0 ? '' : records[found]!.note.trim(),
        noteFrom,
      };
    }),
  };
}

/** Text of a count cell: zeros are left blank, like on her report. */
export const countText = (n: number): string => (n === 0 ? '' : String(n));

/** Column of the first count cell (after N° and names), 1-based like Excel. */
export const FIRST_COUNT_COL = 3;

/** Number of count columns of a report: one group per month plus the totals. */
export const countColumns = (monthCount: number): number => (monthCount + 1) * COUNTED_CODES.length;

/** The cells of a row after the name, in column order; `note` holds the merged cell (start and span) if any. */
export function rowCells(r: ConsolidatedRow): { values: string[]; note: { start: number; span: number } | null } {
  const per = COUNTED_CODES.length;
  const values: string[] = [];
  r.counts.forEach((c, m) => {
    if (m < r.noteFrom) values.push(...(c ? c.map(countText) : COUNTED_CODES.map(() => '')));
  });
  if (r.note !== '')
    return { values, note: { start: r.noteFrom * per, span: (r.counts.length - r.noteFrom + 1) * per } };
  values.push(...r.totals.map(countText));
  return { values, note: null };
}

/** Her last month choice: the months she ticked and every month that was on the screen then. */
export interface MonthChoice {
  chosen: MonthKey[];
  seen: MonthKey[];
}

/**
 * Months ticked when the consolidated screen opens: the ones she ticked last time, plus any month opened since then
 * (it was not on the screen, so she never unticked it). With no earlier choice every month is ticked.
 */
export function initialMonths(available: MonthKey[], saved: MonthChoice | null): MonthKey[] {
  if (!saved) return [...available];
  return available.filter((m) => saved.chosen.includes(m) || !saved.seen.includes(m));
}
