import { NORMS_GRADES, emptyQuarter, type MonthKey, type QuarterRecord, type Settings, type Student } from './model';

/** How many times each grade of `NORMS_GRADES` was given to one norms criterion over some months, in that order. */
export function gradeCounts(s: Student, months: MonthKey[], criterion: number): number[] {
  const counts = NORMS_GRADES.map(() => 0);
  for (const m of months) {
    for (const g of s.norms[m]?.[criterion] ?? []) {
      const k = NORMS_GRADES.indexOf(g);
      if (k >= 0) counts[k]++;
    }
  }
  return counts;
}

/**
 * Suggested quarter grade from the daily grades: AD=4, A=3, B=2, C=1, averaged and rounded to the nearest grade (a
 * tie of .5 goes up). '' when there is no grade at all.
 */
export function suggestedGrade(counts: number[]): string {
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0) return '';
  const points = counts.reduce((sum, c, k) => sum + c * (NORMS_GRADES.length - k), 0);
  const level = Math.round(points / n);
  return NORMS_GRADES[NORMS_GRADES.length - level];
}

/** The student's quarter record, fitted to the number of rows of the report (created when missing). */
export function quarterOf(s: Student, criteriaCount: number): QuarterRecord {
  if (!s.quarter) s.quarter = emptyQuarter(criteriaCount);
  for (const list of [s.quarter.grades, s.quarter.notes]) {
    while (list.length < criteriaCount) list.push('');
    list.length = criteriaCount;
  }
  return s.quarter;
}

/** What the report shows for one row: her own grade when she chose one, otherwise the suggestion. */
export interface QuarterGrade {
  grade: string;
  suggested: string;
  /** She chose a grade different from the suggestion (or there is no suggestion). */
  byHand: boolean;
  counts: number[];
}

export function quarterGrade(s: Student, settings: Settings, row: number): QuarterGrade {
  const source = settings.quarterCriteria[row]?.source ?? row;
  const counts = gradeCounts(s, settings.quarterMonths, source);
  const suggested = suggestedGrade(counts);
  const own = s.quarter?.grades[row] ?? '';
  return { grade: own || suggested, suggested, byHand: own !== '', counts };
}

/** Grades printed for a student, one per row ('' = no grade). */
export function quarterGrades(s: Student, settings: Settings): string[] {
  return settings.quarterCriteria.map((_, i) => quarterGrade(s, settings, i).grade);
}

/** Saves her choice: picking the suggested grade again goes back to following the suggestion. */
export function setQuarterGrade(s: Student, settings: Settings, row: number, grade: string): void {
  const { suggested } = quarterGrade(s, settings, row);
  quarterOf(s, settings.quarterCriteria.length).grades[row] = grade === suggested ? '' : grade;
}

/** Complete when every row has a grade; a student with a special note (e.g. a transfer) has nothing to grade. */
export function isQuarterComplete(s: Student, settings: Settings): boolean {
  if (hasSpecialNote(s, settings.quarterMonths)) return true;
  return quarterGrades(s, settings).every((g) => g !== '');
}

/** Conduct note, or an attendance note in one of the quarter's months (transfer, left the school...). */
export function hasSpecialNote(s: Student, months: MonthKey[]): boolean {
  return s.note.trim() !== '' || months.some((m) => (s.attendance[m]?.note ?? '').trim() !== '');
}

/** Students whose sheet is printed: at least one grade. The rest are skipped and listed in the warning. */
export function quarterStudents(students: Student[], settings: Settings): Student[] {
  return students.filter((s) => quarterGrades(s, settings).some((g) => g !== ''));
}

/** Starts a new quarter: no months chosen, and every grade and observation she typed is cleared. */
export function clearQuarter(classes: { students: Student[] }[], settings: Settings): void {
  settings.quarterMonths = [];
  for (const c of classes) for (const s of c.students) s.quarter = emptyQuarter(settings.quarterCriteria.length);
}
