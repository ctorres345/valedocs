import { isAttendanceComplete, type MonthDone } from '../domain/attendance';
import { isNormsComplete } from '../domain/norms';
import { getData } from '../storage/store';
import { T } from '../ui/texts';

/**
 * The two reports that work month by month on the class's shared school months. They share the months list
 * and the "what is still pending" warning; this table holds what differs.
 */
export type MonthKind = 'attendance' | 'norms';

export interface MonthKindInfo {
  /** The report's 3-step guide. */
  guideRoute: string;
  exportRoute: string;
  /** Months list of a class, or the entry screen of one of its months. */
  monthsRoute: (classId: string) => string;
  entryRoute: (classId: string, month: string) => string;
  isDone: () => MonthDone;
  title: string;
  intro: string;
  backToGuide: string;
}

export const MONTH_KINDS: Record<MonthKind, MonthKindInfo> = {
  attendance: {
    guideRoute: '#/attendance',
    exportRoute: '#/export/attendance',
    monthsRoute: (id) => `#/class/${id}/attendance`,
    entryRoute: (id, month) => `#/class/${id}/attendance/${month}`,
    isDone: () => isAttendanceComplete,
    title: T.attendanceTitle,
    intro: T.attendanceIntro,
    backToGuide: T.backToAttendance,
  },
  norms: {
    guideRoute: '#/norms',
    exportRoute: '#/export/norms',
    monthsRoute: (id) => `#/class/${id}/norms`,
    entryRoute: (id, month) => `#/class/${id}/norms/${month}`,
    isDone: () => {
      const criteria = getData().settings.normsCriteria.length;
      return (s, am) => isNormsComplete(s, am, criteria);
    },
    title: T.normsTitle,
    intro: T.normsIntro,
    backToGuide: T.backToNorms,
  },
};
