import { h } from '../ui/dom';
import { T } from '../ui/texts';
import { monthName, pendingMonths, studentsMissingWorkshopAnyMonth } from '../domain/attendance';
import type { SchoolClass } from '../domain/model';
import { MONTH_KINDS, type MonthKind } from './month-kind';
import { goTo, isIncluded } from './view';

/**
 * Warning listing what is not ready before downloading a month-by-month report: months with unmarked students,
 * a missing tutor name (once per class) and classes with no month. `skip` leaves out the month she is working on.
 */
export function monthsWarning(
  kindName: MonthKind,
  classes: SchoolClass[],
  skip?: { classId: string; month: string },
): HTMLElement | null {
  const kind = MONTH_KINDS[kindName];
  const included = classes.filter((c) => isIncluded(c.id));
  const pending = pendingMonths(included, kind.isDone()).filter(
    (x) => !(x.schoolClass.id === skip?.classId && x.month.month === skip.month),
  );
  const withoutMonths = included.filter((c) => c.attendanceMonths.length === 0);
  const tutorShown = new Set<string>();
  const lines = pending.flatMap(({ schoolClass: c, month, pending: p }) => {
    const reasons = [
      p.incompleteStudents > 0 ? T.pendingStudents(p.incompleteStudents) : null,
      p.missingTutor && !tutorShown.has(c.id) ? T.pendingTutor : null,
    ].filter((x): x is string => x !== null);
    if (p.missingTutor) tutorShown.add(c.id);
    if (reasons.length === 0) return [];
    const name = monthName(month.month);
    return [
      h(
        'li',
        {},
        h('span', {}, h('strong', {}, `${c.label}, ${name}`), `: ${reasons.join(T.and)}`),
        p.incompleteStudents > 0
          ? h(
              'button',
              {
                class: 'btn btn-primary',
                type: 'button',
                onclick: () => goTo(kind.entryRoute(c.id, month.month)),
              },
              T.completeMonth(c.label, name),
            )
          : null,
      ),
    ];
  });
  const emptyClasses = withoutMonths.map((c) =>
    h(
      'li',
      {},
      h('span', {}, T.monthsNoMonth(c.label)),
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', onclick: () => goTo(kind.monthsRoute(c.id)) },
        T.createMonthFor(c.label),
      ),
    ),
  );
  // The workshop is printed in every attendance row and blocks the download, so it is listed once per class
  const noWorkshop =
    kindName === 'attendance'
      ? included.flatMap((c) => {
          const n = studentsMissingWorkshopAnyMonth(c).length;
          return n === 0 ? [] : [{ c, n }];
        })
      : [];
  const workshopLines = noWorkshop.map(({ c, n }) =>
    h(
      'li',
      {},
      h('span', {}, h('strong', {}, c.label), `: ${T.workshopMissingExport(n)}`),
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', onclick: () => goTo(`#/class/${c.id}/details`) },
        T.chooseWorkshop,
      ),
    ),
  );
  const total = lines.length + emptyClasses.length + workshopLines.length;
  if (total === 0) return null;
  return h(
    'div',
    { class: 'warning-banner', role: 'status' },
    h('strong', {}, total === 1 ? T.monthsPendingOne : T.monthsPendingMany),
    h('ul', { class: 'pending-list' }, lines, emptyClasses, workshopLines),
    h('p', { class: 'muted' }, workshopLines.length > 0 ? T.workshopRequiredHint : T.monthsPendingHint),
  );
}
