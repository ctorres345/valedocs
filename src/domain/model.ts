import { collapseSpaces } from './text';

export interface Column {
  /** First header line (e.g. PRESENTACION). */
  line1: string;
  /** Optional second line (e.g. PERSONAL). If empty, the header spans both rows. */
  line2: string;
}

/** A month as "YYYY-MM", e.g. "2026-09". */
export type MonthKey = string;

/** Attendance of one student in one month: one mark per school day of that month. */
export interface AttendanceRecord {
  /** One mark per entry of the month's `days`; empty string = not marked yet. */
  marks: string[];
  /** If it has text, it replaces the marks (e.g. TRASLADO AL EXTRANJERO). */
  note: string;
}

/** A month of attendance opened for a class: which days of the month have school. */
export interface AttendanceMonth {
  month: MonthKey;
  /** Day numbers (1-31), ascending. */
  days: number[];
}

/** H = Hombre, M = Mujer; '' = not chosen yet. Only the monthly norms report needs it. */
export type Gender = '' | 'H' | 'M';
export const GENDERS: Gender[] = ['H', 'M'];

/** Workshop codes as printed in the attendance report; the full names live in `texts.ts`. */
export const WORKSHOPS = ['IND', 'CARP', 'COMP', 'CONF', 'ELEC'];

export function isWorkshop(code: unknown): code is string {
  return typeof code === 'string' && WORKSHOPS.includes(code);
}

export interface Student {
  name: string;
  /** One grade per column; empty string = no grade. */
  grades: string[];
  /** If it has text, it replaces the grades (e.g. TRASLADO AL EXTRANJERO). */
  note: string;
  /** Attendance by month; independent of the conduct grades. */
  attendance: Record<MonthKey, AttendanceRecord>;
  /** Monthly norms report: `norms[month][criterion][dayIndex]`, aligned with the month's `days`; '' = not graded. */
  norms: Record<MonthKey, string[][]>;
  gender: Gender;
  /** Code of the extracurricular workshop (see `WORKSHOPS`); '' = not chosen. Mandatory in the attendance report. */
  workshop: string;
}

export interface SchoolClass {
  id: string;
  /** E.g. "5° A - SECUNDARIA" */
  label: string;
  /** Tutor's name only, e.g. "Roxana Sanchez"; the report adds the "TUTOR:" prefix. */
  tutor: string;
  students: Student[];
  /** Months of attendance opened for this class, oldest first. */
  attendanceMonths: AttendanceMonth[];
}

export interface Settings {
  institution1: string;
  institution2: string;
  title1: string;
  title2: string;
  term: string;
  columns: Column[];
  allowedGrades: string[];
  /** Optional line printed on the attendance report, e.g. "BUZO: LUNES Y JUEVES". */
  uniformNote: string;
  /** Title of the monthly norms report. */
  normsTitle: string;
  /** The three criteria of the norms report, in the order of the template. */
  normsCriteria: NormsCriterion[];
}

/** One criterion of the monthly norms report: its name and the paragraph printed for each grade of `NORMS_GRADES`. */
export interface NormsCriterion {
  name: string;
  /** Paragraphs for students marked H. */
  texts: string[];
  /** Paragraphs for students marked M. */
  textsFemale: string[];
}

export interface AppData {
  version: 5;
  settings: Settings;
  classes: SchoolClass[];
}

export const DEFAULT_GRADES = ['AD', 'A', 'B', 'C'];

/** Grades of the norms report; `NormsCriterion.texts` has one paragraph per entry, in this order. */
export const NORMS_GRADES = ['AD', 'A', 'B', 'C'];

export function defaultNormsCriteria(): NormsCriterion[] {
  return [
    {
      name: 'Asistencia y Puntualidad',
      texts: [
        'El estudiante asiste puntualmente todos los días, presenta su agenda con fecha y firma al ingresar al colegio.',
        'El estudiante asiste regularmente puntual al colegio presentando su agenda con fecha y firma. Justifica de manera oportuna sus faltas y tardanzas.',
        'El estudiante presenta faltas y tardanzas eventualmente, no trae agenda al ingresar al colegio. No justifica su inasistencia de manera oportuna.',
        'El estudiante no asiste con frecuencia al colegio, no justifica, llega tarde y no presenta su agenda.',
      ],
      textsFemale: [
        'La estudiante asiste puntualmente todos los días, presenta su agenda con fecha y firma al ingresar al colegio.',
        'La estudiante asiste regularmente puntual al colegio presentando su agenda con fecha y firma. Justifica de manera oportuna sus faltas y tardanzas.',
        'La estudiante presenta faltas y tardanzas eventualmente, no trae agenda al ingresar al colegio. No justifica su inasistencia de manera oportuna.',
        'La estudiante no asiste con frecuencia al colegio, no justifica, llega tarde y no presenta su agenda.',
      ],
    },
    {
      name: 'Presentación personal e higiene',
      texts: [
        'El estudiante asiste correctamente con el uniforme y su aseo personal todos los días.',
        'El estudiante cumple casi siempre con su uniforme y aseo personal. Asume su compromiso de mejora cuando se le indica.',
        'El estudiante asiste parcialmente uniformado sin presentar ningún tipo de justificación. Evidencia descuido personal.',
        'El estudiante asiste permanentemente sin uniforme completo usando accesorios adicionales (maquillaje, tatuaje, alhajas, cabello pintado). Descuido personal en su aseo.',
      ],
      textsFemale: [
        'La estudiante asiste correctamente con el uniforme y su aseo personal todos los días.',
        'La estudiante cumple casi siempre con su uniforme y aseo personal. Asume su compromiso de mejora cuando se le indica.',
        'La estudiante asiste parcialmente uniformada sin presentar ningún tipo de justificación. Evidencia descuido personal.',
        'La estudiante asiste permanentemente sin uniforme completo usando accesorios adicionales (maquillaje, tatuaje, alhajas, cabello pintado). Descuido personal en su aseo.',
      ],
    },
    {
      name: 'Comportamiento',
      texts: [
        'El estudiante respeta las normas establecidas en el Reglamento Interno del colegio, promueve el respeto y la convivencia armónica entre sus compañeros.',
        'El estudiante respeta las normas establecidas en el Reglamento Interno. Se comunica de manera respetuosa con la Comunidad Educativa.',
        'El estudiante tiene un comportamiento inadecuado con sus profesores y compañeros, pero cuando se habla con ellos evidencia una actitud de escucha.',
        'El estudiante se conduce de manera inapropiada con sus profesores y compañeros. No controla sus emociones, usa un lenguaje grosero, no respeta normas y no escucha cuando se le corrige de manera respetuosa. No evidencia mejora en sus actitudes.',
      ],
      textsFemale: [
        'La estudiante respeta las normas establecidas en el Reglamento Interno del colegio, promueve el respeto y la convivencia armónica entre sus compañeros.',
        'La estudiante respeta las normas establecidas en el Reglamento Interno. Se comunica de manera respetuosa con la Comunidad Educativa.',
        'La estudiante tiene un comportamiento inadecuado con sus profesores y compañeros, pero cuando se habla con ella evidencia una actitud de escucha.',
        'La estudiante se conduce de manera inapropiada con sus profesores y compañeros. No controla sus emociones, usa un lenguaje grosero, no respeta normas y no escucha cuando se le corrige de manera respetuosa. No evidencia mejora en sus actitudes.',
      ],
    },
  ];
}

/**
 * Settings of a fresh install. They are generic on purpose: the school's own name, titles and logos are typed in
 * "Ajustes del reporte" or loaded from a school pack, and from then on they live in the browser and in backups.
 */
export function defaultSettings(): Settings {
  return {
    institution1: 'INSTITUCIÓN EDUCATIVA',
    institution2: '',
    title1: 'REPORTE DE NIVELES DE LOGRO EN EL CUMPLIMIENTO DE LAS NORMAS',
    title2: '',
    term: `I TRIMESTRE - ${new Date().getFullYear()}`,
    columns: [
      { line1: 'PRESENTACION', line2: 'PERSONAL' },
      { line1: 'ASISTENCIA', line2: 'PUNTUALIDAD' },
      { line1: 'COMPORTAMIENTO', line2: '' },
    ],
    allowedGrades: [...DEFAULT_GRADES],
    uniformNote: '',
    normsTitle: 'REPORTE MENSUAL DEL CUMPLIMIENTO DE NORMAS',
    normsCriteria: defaultNormsCriteria(),
  };
}

export function emptyData(): AppData {
  return { version: 5, settings: defaultSettings(), classes: [] };
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newClass(label: string, tutor: string, students: Student[]): SchoolClass {
  return { id: newId(), label, tutor, students, attendanceMonths: [] };
}

export function newStudent(name: string, columnCount: number, gender: Gender = '', workshop = ''): Student {
  return {
    name,
    grades: Array.from({ length: columnCount }, () => ''),
    note: '',
    attendance: {},
    norms: {},
    gender,
    workshop,
  };
}

/** A student is complete when they have a note or all their grades filled in. */
export function isStudentComplete(a: Student): boolean {
  return a.note.trim() !== '' || a.grades.every((n) => n !== '');
}

export interface Pending {
  /** Students whose grades are not complete yet. */
  incompleteStudents: number;
  missingTutor: boolean;
}

/** What is still missing in a class before its report is final; null when nothing is missing. */
export function pendingOf(c: SchoolClass): Pending | null {
  const incompleteStudents = c.students.filter((s) => !isStudentComplete(s)).length;
  const missingTutor = cleanName(c.tutor) === '';
  return incompleteStudents === 0 && !missingTutor ? null : { incompleteStudents, missingTutor };
}

export function progress(c: SchoolClass): { doneCount: number; total: number } {
  return { doneCount: c.students.filter(isStudentComplete).length, total: c.students.length };
}

/** Fits every student's grades to the number of columns (when the headers change). */
export function fitGrades(classes: SchoolClass[], columnCount: number): void {
  for (const c of classes) {
    for (const a of c.students) {
      while (a.grades.length < columnCount) a.grades.push('');
      if (a.grades.length > columnCount) a.grades.length = columnCount;
    }
  }
}

/** Clean name: repeated spaces collapsed and no leading or trailing spaces. */
export const cleanName = collapseSpaces;

/** Parses "5° A", "4to B" or "4ºA" as year and section. */
function parseCourse(text: string): { year: string; section: string } | null {
  const m = collapseSpaces(text).match(/(\d+)\s*(?:°|º|to|ro|do|er|vo|mo|ero)?\s*([A-Za-z])\b/);
  return m ? { year: m[1], section: m[2].toUpperCase() } : null;
}

/** Year of a class label ("5° A - SECUNDARIA" → 5); null when the label has none. */
export function classYear(label: string): number | null {
  const c = parseCourse(label);
  return c ? parseInt(c.year, 10) : null;
}

/** Workshops offered to a class: 1st-2nd grade and 3rd-5th grade differ; with no year in the label all are offered. */
export function workshopsFor(label: string): string[] {
  const year = classYear(label);
  if (year === null) return [...WORKSHOPS];
  return year <= 2 ? ['IND', 'CONF', 'COMP', 'ELEC'] : ['CARP', 'COMP', 'CONF', 'ELEC'];
}

/** "5° A - SECUNDARIA" → "5°A", used for sheet and file names. */
export function shortName(label: string): string {
  const c = parseCourse(label);
  if (c) return `${c.year}°${c.section}`;
  return collapseSpaces(label.replace(/[\\/?*[\]:]/g, ' ')).slice(0, 31) || 'Clase';
}

/** Normalized label from text such as "4to A - SECUNDARIA" or from a sheet name like "4ºA". */
export function normalizedLabel(text: string, schoolLevel = 'SECUNDARIA'): string {
  const c = parseCourse(text);
  if (!c) return collapseSpaces(text);
  const levelName = /PRIMARIA/i.test(text) ? 'PRIMARIA' : /SECUNDARIA/i.test(text) ? 'SECUNDARIA' : schoolLevel;
  return `${c.year}° ${c.section} - ${levelName}`;
}

/** Two labels are the same class when they have the same year and section (e.g. "5°A" and "5° A - SECUNDARIA"). */
export function sameClass(a: string, b: string): boolean {
  return shortName(a).toLowerCase() === shortName(b).toLowerCase();
}

const TUTOR_PREFIX = /^\s*tutora?\s*:\s*/i;

/** The tutor's name without any "TUTOR:"/"TUTORA:" prefix she may have typed. */
export function parseTutor(input: string): string {
  return cleanName(input.replace(TUTOR_PREFIX, ''));
}

/** Report text for the tutor line, e.g. "TUTOR: ROXANA SANCHEZ"; empty when there is no name. */
export function formatTutor(c: Pick<SchoolClass, 'tutor'>): string {
  const name = parseTutor(c.tutor);
  return name === '' ? '' : `TUTOR: ${name.toLocaleUpperCase('es')}`;
}
