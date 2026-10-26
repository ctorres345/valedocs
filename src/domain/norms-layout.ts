import { monthLabels, monthName, parseMonthKey, weekdayOf, weekdaysOf } from './attendance';
import { paragraphFor } from './norms';
import { shortName, type AttendanceMonth, type SchoolClass, type Settings, type Student } from './model';
import { safeFileName } from './text';

/**
 * Single description of the monthly norms report of one student. Word, PDF and the on-screen preview read from
 * here. Spanish here is report data (the template's own wording).
 */
export const HOLIDAY_LABEL = 'FERIADO';
export const CRITERIA_HEADER = 'Criterios/Días';
export const NORMS_HEADER_LABELS = {
  name: 'Apellidos y Nombres',
  course: 'Grado y Sección',
  month: 'MES',
  tutor: 'Tutor/a',
} as const;

const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

export interface NormsDay {
  /** "Lunes 6", or just "Lunes" for a day that is not part of the month. */
  header: string;
  /** A weekday of the month without school: printed as one merged cell over all criteria. */
  holiday: boolean;
  /** One paragraph per criterion; empty when the box is not graded (or the day has no school). */
  texts: string[];
}

export interface NormsReport {
  title: string;
  name: string;
  course: string;
  /** Month name without year, e.g. "Julio". */
  month: string;
  tutor: string;
  criteria: string[];
  /** Monday-to-Friday weeks that have at least one school day; always 5 days each. */
  weeks: NormsDay[][];
}

export function buildNormsReport(
  schoolClass: SchoolClass,
  student: Student,
  settings: Settings,
  am: AttendanceMonth,
): NormsReport {
  const criteria = settings.normsCriteria.map((c) => c.name);
  const grades = student.norms[am.month] ?? [];
  const weeks: { days: NormsDay[]; hasSchool: boolean }[] = [];
  let week: (typeof weeks)[number] | null = null;
  let lastSlot = 0;
  for (const day of weekdaysOf(am.month)) {
    const slot = weekdayOf(am.month, day);
    if (!week || slot <= lastSlot) {
      week = {
        days: WEEKDAY_NAMES.map((n) => ({ header: n, holiday: false, texts: criteria.map(() => '') })),
        hasSchool: false,
      };
      weeks.push(week);
    }
    lastSlot = slot;
    const k = am.days.indexOf(day);
    if (k >= 0) week.hasSchool = true;
    week.days[slot - 1] = {
      header: `${WEEKDAY_NAMES[slot - 1]} ${day}`,
      holiday: k < 0,
      texts: criteria.map((_, i) => (k < 0 ? '' : paragraphFor(settings, i, grades[i]?.[k] ?? '', student.gender))),
    };
  }
  const month = parseMonthKey(am.month);
  return {
    title: settings.normsTitle,
    name: student.name,
    course: schoolClass.label,
    month: month ? monthLabels()[month.month - 1] : '',
    tutor: schoolClass.tutor,
    criteria,
    // Weeks with no school at all (vacations) are left out
    weeks: weeks.filter((w) => w.hasSchool).map((w) => w.days),
  };
}

/** File name (no extension) of one student's report, or of the file holding the whole class when `student` is null. */
export function normsFileName(schoolClass: SchoolClass, am: AttendanceMonth, student: Student | null): string {
  const course = shortName(schoolClass.label);
  const when = monthName(am.month);
  if (!student) return safeFileName(`${course} - Normas ${when}`);
  const n = String(schoolClass.students.indexOf(student) + 1).padStart(2, '0');
  return safeFileName(`${course} - ${n} ${student.name} - ${when}`);
}
