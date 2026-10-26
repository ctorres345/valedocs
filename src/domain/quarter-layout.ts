import { NORMS_GRADES, type SchoolClass, type Settings, type Student } from './model';
import { quarterGrades } from './quarter';

/**
 * Single description of the quarter norms report: one strip per student, three strips per A4 page. PDF and the
 * on-screen preview read from here. Spanish here is report data (the template's own wording).
 */
export const QUARTER_LABELS = {
  name: 'Apellidos y Nombres',
  course: 'Grado/Sección',
  auxiliary: 'Auxiliar',
  number: 'N°',
  criteria: 'Criterios',
  level: 'Nivel de logro',
  notes: 'Observaciones',
} as const;

/** Strips printed on each A4 page, to be cut apart. */
export const QUARTER_PER_PAGE = 3;

export interface QuarterRow {
  criterion: string;
  /** The grade circled among `NORMS_GRADES`; '' circles none (blank sheet). */
  grade: string;
  note: string;
}

export interface QuarterSheet {
  institution1: string;
  institution2: string;
  term: string;
  title: string;
  name: string;
  course: string;
  auxiliary: string;
  /** Every grade is printed and the chosen one is circled, like the paper form. */
  levels: string[];
  rows: QuarterRow[];
}

/** One student's strip. With `blank` no grade is circled and there are no observations. */
export function buildQuarterSheet(c: SchoolClass, s: Student, settings: Settings, blank = false): QuarterSheet {
  const grades = blank ? [] : quarterGrades(s, settings);
  const notes = blank ? [] : (s.quarter?.notes ?? []);
  return {
    institution1: settings.institution1,
    institution2: settings.institution2,
    term: settings.term,
    title: settings.quarterTitle,
    name: s.name,
    course: c.label,
    auxiliary: settings.auxiliary.trim(),
    levels: [...NORMS_GRADES],
    rows: settings.quarterCriteria.map((q, i) => ({
      criterion: q.name,
      grade: grades[i] ?? '',
      note: (notes[i] ?? '').trim(),
    })),
  };
}
