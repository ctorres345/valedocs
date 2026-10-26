import {
  NORMS_GRADES,
  type AttendanceMonth,
  type Gender,
  type MonthKey,
  type SchoolClass,
  type Settings,
  type Student,
} from './model';

/** Grades of one student for a month: one row per criterion, one grade per school day of the month, created when missing. */
export function normsOf(s: Student, am: AttendanceMonth, criteriaCount: number): string[][] {
  const rows = (s.norms[am.month] ??= []);
  while (rows.length < criteriaCount) rows.push([]);
  rows.length = criteriaCount;
  for (const row of rows) {
    while (row.length < am.days.length) row.push('');
    row.length = am.days.length;
  }
  return rows;
}

/** Number of boxes (criterion × school day) she has graded. */
export function gradedCount(s: Student, month: MonthKey): number {
  return (s.norms[month] ?? []).reduce((n, row) => n + row.filter((g) => g !== '').length, 0);
}

/**
 * Complete when every box (criterion × school day) has a grade. A month without school days is complete, and so is a
 * student with a special note (conduct or attendance, e.g. a transfer) since there is nothing to grade.
 */
export function isNormsComplete(s: Student, am: AttendanceMonth, criteriaCount: number): boolean {
  if (s.note.trim() !== '' || (s.attendance[am.month]?.note ?? '').trim() !== '') return true;
  return gradedCount(s, am.month) === criteriaCount * am.days.length;
}

/** A class is done for norms when it has at least one month and every student is complete in every month. */
export function isClassNormsComplete(c: SchoolClass, settings: Settings): boolean {
  const n = settings.normsCriteria.length;
  return (
    c.attendanceMonths.length > 0 &&
    c.attendanceMonths.every((am) => c.students.every((s) => isNormsComplete(s, am, n)))
  );
}

/** Paragraph printed for a grade of a criterion, in the wording of the student's gender (H when not chosen); empty when there is no grade or no text for it. */
export function paragraphFor(settings: Settings, criterion: number, grade: string, gender: Gender = ''): string {
  const k = NORMS_GRADES.indexOf(grade);
  const c = settings.normsCriteria[criterion];
  return k < 0 || !c ? '' : ((gender === 'M' ? c.textsFemale : c.texts)[k] ?? '');
}

/** Students who will be in the norms files (at least one grade in the month) but have no gender chosen. */
export function studentsMissingGender(c: SchoolClass, month: MonthKey): Student[] {
  return c.students.filter((s) => gradedCount(s, month) > 0 && s.gender === '');
}
