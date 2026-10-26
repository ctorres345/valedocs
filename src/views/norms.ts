import { h, clearChildren, notice, progressBar } from '../ui/dom';
import { T } from '../ui/texts';
import { findClass, change, getData } from '../storage/store';
import { formatTutor, NORMS_GRADES, type SchoolClass } from '../domain/model';
import { findMonth, monthName, weekdayOf } from '../domain/attendance';
import { isNormsComplete, normsOf, studentsMissingGender } from '../domain/norms';
import { stepsBanner } from '../ui/steps';
import { MONTH_KINDS } from './month-kind';
import { monthsWarning } from './months-warning';
import { createUndoStack, gridKeydown, isTouchLayout, loadMode, nextStepButton, saveMode } from './grid-keys';
import { autosaveBanner } from './saving-banner';
import { goTo, type View } from './view';

type Mode = 'grid' | 'day';
const MODE_KEY = 'valedocs:norms-mode';
const MODES = ['grid', 'day'] as const;

/** Entry of one month of the norms report: one student at a time, criteria down and school days across. */
export function normsView(id: string, month: string): View {
  const root = h('div', { class: 'screen screen-grades' });
  const schoolClass = findClass(id);
  const found = schoolClass ? findMonth(schoolClass, month) : undefined;
  if (!schoolClass || !found) {
    root.append(
      h('p', {}, T.notFound),
      h('button', { class: 'btn', type: 'button', onclick: () => goTo(MONTH_KINDS.norms.guideRoute) }, T.backToNorms),
    );
    return { el: root };
  }
  const c: SchoolClass = schoolClass;
  const am = found;

  let mode = loadMode<Mode>(MODE_KEY, MODES, () => (isTouchLayout() ? 'day' : 'grid'));
  let student = 0;
  let row = 0; // selected criterion
  let col = 0; // selected school day
  let activeDay = 0; // day shown in "by day" mode
  const undoStack = createUndoStack();

  const body = h('div', { class: 'grades-body' });
  const progressEl = h('div', { class: 'grades-progress' });
  const toolbar = h('div', { class: 'actions' });
  const picker = h('div', { class: 'student-picker' });
  const genderHint = h('div');
  const keypad = h('div', { class: 'keypad' });
  const footer = h('div', { class: 'grades-footer' });

  const criteria = () => getData().settings.normsCriteria;
  const dayLabel = (k: number): string =>
    T.dayLabel(T.weekdayShort[weekdayOf(month, am.days[k]) - 1] ?? '', am.days[k]);
  const gradeOf = (r: number, k: number): string => c.students[student].norms[month]?.[r]?.[k] ?? '';
  const isDone = (i: number): boolean => isNormsComplete(c.students[i], am, criteria().length);

  // ---------- Changes with undo ----------
  function snapshot(): void {
    undoStack.push(JSON.stringify(c.students.map((s) => s.norms[month] ?? null)));
  }
  function undo(): void {
    const previous = undoStack.pop();
    if (!previous) return notice(T.nothingToUndo, 'info');
    const saved = JSON.parse(previous) as (string[][] | null)[];
    change(() =>
      c.students.forEach((s, i) => {
        const rows = saved[i];
        if (rows) s.norms[month] = rows;
        else delete s.norms[month];
      }),
    );
    render();
  }

  /** After a grade: next criterion of the same day, then the first criterion of the next day. */
  function advance(): void {
    if (row < criteria().length - 1) row += 1;
    else if (col < am.days.length - 1) {
      row = 0;
      col += 1;
    }
  }

  function setGrade(r: number, k: number, value: string, moveOn: boolean): void {
    const s = c.students[student];
    if (!s) return;
    snapshot();
    change(() => (normsOf(s, am, criteria().length)[r][k] = value));
    if (moveOn) advance();
    render();
  }

  function fill(): void {
    const s = c.students[student];
    if (!s) return;
    snapshot();
    let n = 0;
    change(() => {
      for (const grades of normsOf(s, am, criteria().length)) {
        grades.forEach((g, k) => {
          if (g === '') {
            grades[k] = 'A';
            n++;
          }
        });
      }
    });
    if (n === 0) undoStack.pop();
    if (n === 0) notice(T.noEmptyCells, 'info');
    else notice(T.filled(n), 'ok', { label: `↶ ${T.undo}`, run: undo });
    render();
  }

  function selectStudent(i: number): void {
    student = Math.max(0, Math.min(c.students.length - 1, i));
    row = 0;
    col = 0;
    activeDay = 0;
    render();
  }

  // ---------- Rendering ----------
  function renderProgress(): void {
    const done = c.students.filter((_, i) => isDone(i)).length;
    clearChildren(progressEl);
    progressEl.append(
      progressBar(done, c.students.length),
      h('span', { class: 'muted' }, T.completed(done, c.students.length)),
    );
  }

  function modeButton(m: Mode, text: string): HTMLElement {
    return h(
      'button',
      {
        class: `btn ${mode === m ? 'active' : ''}`,
        type: 'button',
        'aria-pressed': String(mode === m),
        onclick: () => {
          mode = m;
          saveMode(MODE_KEY, m);
          render();
        },
      },
      text,
    );
  }

  /** The wording of the report depends on H/M, which is chosen on the class details screen. */
  function renderGenderHint(): void {
    clearChildren(genderHint);
    const missing = studentsMissingGender(c, month).length;
    if (missing === 0) return;
    genderHint.append(
      h(
        'div',
        { class: 'warning-banner spaced', role: 'status' },
        h('strong', {}, T.genderMissingNorms(missing)),
        h('button', { class: 'btn', type: 'button', onclick: () => goTo(`#/class/${id}/details`) }, T.chooseGender),
      ),
    );
  }

  function renderToolbar(): void {
    clearChildren(toolbar);
    toolbar.append(
      h(
        'div',
        { class: 'toggle', role: 'group', 'aria-label': T.entryMode },
        modeButton('grid', T.grid),
        modeButton('day', T.byDay),
      ),
      h('button', { class: 'btn', type: 'button', onclick: fill }, T.fillStudentWithA),
      h('button', { class: 'btn', type: 'button', onclick: undo }, `↶ ${T.undo}`),
    );
  }

  function renderPicker(): void {
    const select = h(
      'select',
      { class: 'field', 'aria-label': T.student },
      c.students.map((s, i) =>
        h('option', { value: i, selected: i === student }, `${isDone(i) ? '✓ ' : ''}${i + 1}. ${s.name}`),
      ),
    );
    select.addEventListener('change', () => selectStudent(Number(select.value)));
    picker.append(
      h(
        'button',
        { class: 'btn', type: 'button', disabled: student === 0, onclick: () => selectStudent(student - 1) },
        T.previousStudent,
      ),
      select,
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          disabled: student === c.students.length - 1,
          onclick: () => selectStudent(student + 1),
        },
        T.nextStudent,
      ),
    );
  }

  function renderGrid(): void {
    const table = h(
      'table',
      { class: 'grades-table attendance-table norms-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { class: 'col-name' }, T.criterion),
          am.days.map((_, k) => h('th', { class: 'col-day', title: dayLabel(k) }, String(am.days[k]))),
        ),
      ),
      h(
        'tbody',
        {},
        criteria().map((criterion, r) =>
          h(
            'tr',
            {},
            h('td', { class: 'col-name' }, criterion.name),
            am.days.map((_, k) => {
              const value = gradeOf(r, k);
              return h(
                'td',
                { class: 'col-day' },
                h(
                  'button',
                  {
                    class: `cell ${r === row && k === col ? 'selected' : ''} ${value === '' ? 'empty' : ''}`,
                    type: 'button',
                    'aria-label': `${criterion.name}, ${dayLabel(k)}: ${value || T.emptyCell}`,
                    onclick: () => {
                      row = r;
                      col = k;
                      render();
                    },
                  },
                  value,
                ),
              );
            }),
          ),
        ),
      ),
    );
    body.append(h('div', { class: 'table-scroll' }, table), h('p', { class: 'muted keys-help' }, T.normsKeysHelp));
  }

  function renderKeypad(): void {
    clearChildren(keypad);
    if (mode !== 'grid' || c.students.length === 0 || am.days.length === 0) return;
    const current = gradeOf(row, col);
    keypad.append(
      h('div', { class: 'keypad-info' }, criteria()[row].name, h('span', { class: 'muted' }, ` — ${dayLabel(col)}`)),
      h(
        'div',
        { class: 'keypad-buttons' },
        NORMS_GRADES.map((g) =>
          h(
            'button',
            {
              class: `btn btn-grade ${current === g ? 'active' : ''}`,
              type: 'button',
              onclick: () => setGrade(row, col, g, true),
            },
            g,
          ),
        ),
        h('button', { class: 'btn btn-grade', type: 'button', onclick: () => setGrade(row, col, '', false) }, T.erase),
      ),
    );
  }

  /** Shows day k from its first criterion (the list may have been scrolled to the bottom). */
  function openDay(k: number): void {
    activeDay = k;
    render();
    body.querySelector('.grade-list')?.scrollIntoView({ block: 'start' });
  }

  function renderByDay(): void {
    if (activeDay >= am.days.length) activeDay = 0;
    const step = (delta: number) => () => openDay(activeDay + delta);
    const nav = h(
      'div',
      { class: 'day-nav' },
      h('button', { class: 'btn', type: 'button', disabled: activeDay === 0, onclick: step(-1) }, T.previousDay),
      h('strong', { class: 'day-nav-label' }, dayLabel(activeDay)),
      h(
        'button',
        { class: 'btn', type: 'button', disabled: activeDay === am.days.length - 1, onclick: step(1) },
        T.nextDay,
      ),
    );
    const list = h(
      'div',
      { class: 'grade-list' },
      criteria().map((criterion, r) => {
        const current = gradeOf(r, activeDay);
        return h(
          'div',
          { class: `grade-row ${current !== '' ? 'complete' : ''}` },
          h('div', { class: 'grade-row-name' }, h('span', {}, criterion.name)),
          h(
            'div',
            { class: 'grade-buttons' },
            NORMS_GRADES.map((g) =>
              h(
                'button',
                {
                  class: `btn btn-grade ${current === g ? 'active' : ''}`,
                  type: 'button',
                  'aria-pressed': String(current === g),
                  'aria-label': `${criterion.name}: ${g}`,
                  onclick: () => setGrade(r, activeDay, current === g ? '' : g, false),
                },
                g,
              ),
            ),
          ),
        );
      }),
    );
    body.append(nav, list);
    if (activeDay < am.days.length - 1)
      body.append(nextStepButton(T.nextDayButton(dayLabel(activeDay + 1)), () => openDay(activeDay + 1)));
  }

  /** Next student, then the pending months of other classes, or the download step. */
  function renderFooter(): void {
    clearChildren(footer);
    const warning = monthsWarning('norms', getData().classes, { classId: id, month });
    const hasNext = student < c.students.length - 1;
    footer.append(
      warning ?? h('span'),
      h(
        'div',
        { class: 'actions spaced' },
        h(
          'button',
          { class: 'btn', type: 'button', onclick: () => goTo(MONTH_KINDS.norms.monthsRoute(id)) },
          T.backToMonths,
        ),
        hasNext
          ? h(
              'button',
              { class: 'btn btn-primary', type: 'button', onclick: () => selectStudent(student + 1) },
              T.nextStudent,
            )
          : null,
        // Always offered: students with no grade at all are simply left out of the files, so a pending
        // one (e.g. who left the school) must not block the download
        h(
          'button',
          {
            class: `btn ${hasNext || warning ? '' : 'btn-primary'}`,
            type: 'button',
            onclick: () => goTo(`${MONTH_KINDS.norms.exportRoute}/${id}/${month}`),
          },
          T.nextDownload,
        ),
      ),
    );
  }

  function render(): void {
    const scroll = window.scrollY;
    clearChildren(body);
    clearChildren(picker);
    renderGenderHint();
    renderProgress();
    renderToolbar();
    if (c.students.length === 0 || am.days.length === 0) {
      body.append(
        h('p', {}, c.students.length === 0 ? T.classWithoutStudents : T.chooseDaysNone),
        h(
          'button',
          { class: 'btn btn-primary', type: 'button', onclick: () => goTo(`#/class/${id}/details`) },
          T.addStudent,
        ),
      );
    } else {
      if (student >= c.students.length) student = c.students.length - 1;
      row = Math.min(row, criteria().length - 1);
      col = Math.min(col, am.days.length - 1);
      renderPicker();
      if (mode === 'grid') renderGrid();
      else renderByDay();
    }
    renderKeypad();
    renderFooter();
    if (mode === 'grid') {
      body.querySelector<HTMLElement>('.cell.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else window.scrollTo(0, scroll);
  }

  // ---------- Keyboard ----------
  const onKeydown = gridKeydown({
    active: () => mode === 'grid' && c.students.length > 0 && am.days.length > 0,
    rowCount: () => criteria().length,
    colCount: () => am.days.length,
    position: () => ({ row, col }),
    moveTo: (r, k) => {
      row = r;
      col = k;
      render();
    },
    undo,
    clearCell: () => setGrade(row, col, '', false),
    valueFor: (letter) => (letter === 'D' ? 'AD' : NORMS_GRADES.includes(letter) ? letter : null),
    enter: (value) => setGrade(row, col, value, true),
  });
  document.addEventListener('keydown', onKeydown);

  root.append(
    h(
      'div',
      { class: 'grades-header' },
      stepsBanner(2),
      h(
        'button',
        { class: 'btn btn-text', type: 'button', onclick: () => goTo(MONTH_KINDS.norms.monthsRoute(id)) },
        T.backToMonths,
      ),
      h('h1', {}, `${c.label} — ${monthName(month)}`),
      h('p', { class: c.tutor ? 'muted' : 'muted missing' }, c.tutor ? formatTutor(c) : T.tutorMissing),
    ),
    autosaveBanner(),
    genderHint,
    progressEl,
    toolbar,
    picker,
    body,
    keypad,
    footer,
  );
  render();
  return { el: root, destroy: () => document.removeEventListener('keydown', onKeydown) };
}
