import { h, clearChildren, notice, confirmDialog, progressBar } from '../ui/dom';
import { T } from '../ui/texts';
import { change, findClass, subscribe } from '../storage/store';
import { formatTutor, type AttendanceMonth, type SchoolClass } from '../domain/model';
import { deleteMonth, findMonth, monthName, setMonthDays, weekdaysOf } from '../domain/attendance';
import { stepsBanner } from '../ui/steps';
import { MONTH_KINDS, type MonthKind, type MonthKindInfo } from './month-kind';
import { chooseDays, monthPicker } from './month-days';
import { autosaveBanner } from './saving-banner';
import { goTo, type View } from './view';

function monthRow(c: SchoolClass, am: AttendanceMonth, kind: MonthKindInfo): HTMLElement {
  const isDone = kind.isDone();
  const done = c.students.filter((s) => isDone(s, am)).length;
  return h(
    'article',
    { class: 'card' },
    h('h3', {}, monthName(am.month)),
    progressBar(done, c.students.length),
    h('p', { class: 'muted' }, T.completed(done, c.students.length)),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', onclick: () => goTo(kind.entryRoute(c.id, am.month)) },
        T.openMonth,
      ),
      h(
        'button',
        {
          class: 'btn btn-danger-soft',
          type: 'button',
          onclick: async () => {
            const name = monthName(am.month);
            if (!(await confirmDialog(T.deleteMonthTitle, T.deleteMonthText(name), T.deleteMonth, true))) return;
            change(() => deleteMonth(c, am.month));
          },
        },
        T.deleteMonth,
      ),
    ),
  );
}

/** Months of one class for a month-by-month report, and the form to open a new one. */
export function monthsView(id: string, kindName: MonthKind): View {
  const kind = MONTH_KINDS[kindName];
  const root = h('div', { class: 'screen' });
  const c = findClass(id);
  if (!c) {
    root.append(
      h('p', {}, T.notFound),
      h('button', { class: 'btn', type: 'button', onclick: () => goTo(kind.guideRoute) }, kind.backToGuide),
    );
    return { el: root };
  }
  const schoolClass: SchoolClass = c;

  const picker = monthPicker();
  async function create(): Promise<void> {
    const key = picker.key();
    if (findMonth(schoolClass, key)) return notice(T.monthExists, 'info');
    const days = await chooseDays(key, weekdaysOf(key));
    if (!days) return;
    change(() => setMonthDays(schoolClass, key, days));
    goTo(kind.entryRoute(id, key));
  }

  const list = h('div', { class: 'month-list' });
  function renderList(): void {
    clearChildren(list);
    if (schoolClass.attendanceMonths.length === 0) list.append(h('p', { class: 'muted' }, T.noMonths));
    for (const am of schoolClass.attendanceMonths) list.append(monthRow(schoolClass, am, kind));
  }
  renderList();
  const unsubscribe = subscribe(renderList);

  root.append(
    stepsBanner(2),
    h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo(kind.guideRoute) }, kind.backToGuide),
    h('h1', {}, `${kind.title}: ${schoolClass.label}`),
    h(
      'p',
      { class: schoolClass.tutor ? 'muted' : 'muted missing' },
      schoolClass.tutor ? formatTutor(schoolClass) : T.tutorMissing,
    ),
    h('p', {}, kind.intro),
    autosaveBanner(),
    h('h2', {}, T.monthsOfClass),
    list,
    h(
      'section',
      { class: 'card' },
      h('h2', {}, T.newMonth),
      picker.el,
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => void create() }, T.createMonth),
    ),
  );
  return { el: root, destroy: unsubscribe };
}
