import { h, clearChildren, notice, ask, progressBar } from '../ui/dom';
import { T } from '../ui/texts';
import { findClass, change, getData } from '../storage/store';
import { NAME_HEADER, NUMBER_HEADER } from '../domain/report-layout';
import { formatTutor, type SchoolClass } from '../domain/model';
import {
  ATTENDANCE_CODES,
  findMonth,
  isAttendanceComplete,
  monthName,
  recordOf,
  setMonthDays,
  summarize,
  weekdayOf,
} from '../domain/attendance';
import { stepsBanner } from '../ui/steps';
import { monthsWarning } from './months-warning';
import { chooseDays } from './month-days';
import { createUndoStack, gridKeydown, isTouchLayout, loadMode, nextStepButton, saveMode } from './grid-keys';
import { autosaveBanner } from './saving-banner';
import { goTo, type View } from './view';

type Mode = 'grid' | 'day';
const MODE_KEY = 'valedocs:attendance-mode';
const MODES = ['grid', 'day'] as const;

/** Keyboard shortcut for each mark (J and U are the justified ones). */
const KEY_TO_MARK: Record<string, string> = { A: 'A', T: 'T', F: 'F', J: 'J', U: 'U' };

/** Entry of one month of attendance: keyboard grid on desktop, one day at a time with big buttons on phones. */
export function attendanceView(id: string, month: string): View {
  const root = h('div', { class: 'screen screen-grades' });
  const schoolClass = findClass(id);
  const found = schoolClass ? findMonth(schoolClass, month) : undefined;
  if (!schoolClass || !found) {
    root.append(
      h('p', {}, T.notFound),
      h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/attendance') }, T.backToAttendance),
    );
    return { el: root };
  }
  const c: SchoolClass = schoolClass;
  const am = found;

  let mode = loadMode<Mode>(MODE_KEY, MODES, () => (isTouchLayout() ? 'day' : 'grid'));
  let row = 0;
  let col = 0;
  let activeDay = 0; // day shown in "by day" mode
  const undoStack = createUndoStack();

  const body = h('div', { class: 'grades-body' });
  const progressEl = h('div', { class: 'grades-progress' });
  const toolbar = h('div', { class: 'actions' });
  const keypad = h('div', { class: 'keypad' });
  const footer = h('div', { class: 'grades-footer' });

  const dayLabel = (k: number): string =>
    T.dayLabel(T.weekdayShort[weekdayOf(month, am.days[k]) - 1] ?? '', am.days[k]);
  const markOf = (f: number, k: number): string => c.students[f].attendance[month]?.marks[k] ?? '';
  const noteOf = (f: number): string => (c.students[f].attendance[month]?.note ?? '').trim();

  // ---------- Changes with undo ----------
  function snapshot(): void {
    // Changing the days also remaps the norms grades of the month, so they are part of the snapshot
    undoStack.push(
      JSON.stringify({
        days: am.days,
        records: c.students.map((s) => s.attendance[month] ?? null),
        norms: c.students.map((s) => s.norms[month] ?? null),
      }),
    );
  }
  function undo(): void {
    const previous = undoStack.pop();
    if (!previous) return notice(T.nothingToUndo, 'info');
    const { days, records, norms } = JSON.parse(previous) as {
      days: number[];
      records: (ReturnType<typeof recordOf> | null)[];
      norms: (string[][] | null)[];
    };
    change(() => {
      am.days = days;
      c.students.forEach((s, i) => {
        const r = records[i];
        if (r) s.attendance[month] = r;
        else delete s.attendance[month];
        if (norms[i]) s.norms[month] = norms[i]!;
        else delete s.norms[month];
      });
    });
    render();
  }

  function nextRow(start: number): number {
    for (let i = start + 1; i < c.students.length; i++) if (noteOf(i) === '') return i;
    return start;
  }

  function setMark(f: number, k: number, value: string, advance: boolean): void {
    const s = c.students[f];
    if (!s || noteOf(f) !== '') return;
    snapshot();
    change(() => (recordOf(s, am).marks[k] = value));
    if (advance) row = nextRow(f);
    render();
  }

  async function specialNote(f: number): Promise<void> {
    const s = c.students[f];
    if (!s) return;
    const text = await ask(`${T.specialNoteTitle}: ${s.name}`, T.specialNoteText, noteOf(f), T.suggestions);
    if (text === null) return;
    snapshot();
    change(() => (recordOf(s, am).note = text));
    render();
  }

  function fill(onlyDay: number | null): void {
    snapshot();
    let n = 0;
    change(() => {
      for (const s of c.students) {
        if ((s.attendance[month]?.note ?? '').trim() !== '') continue;
        const r = recordOf(s, am);
        r.marks.forEach((m, k) => {
          if (m === '' && (onlyDay === null || k === onlyDay)) {
            r.marks[k] = 'A';
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

  async function editDays(): Promise<void> {
    const days = await chooseDays(month, am.days);
    if (!days) return;
    snapshot();
    change(() => setMonthDays(c, month, days));
    col = Math.min(col, am.days.length - 1);
    activeDay = Math.min(activeDay, am.days.length - 1);
    render();
  }

  // ---------- Rendering ----------
  function renderProgress(): void {
    const done = c.students.filter((s) => isAttendanceComplete(s, am)).length;
    const total = c.students.length;
    clearChildren(progressEl);
    progressEl.append(progressBar(done, total), h('span', { class: 'muted' }, T.completed(done, total)));
  }

  function switchMode(m: Mode): void {
    mode = m;
    saveMode(MODE_KEY, m);
    render();
  }

  function modeButton(m: Mode, text: string): HTMLElement {
    return h(
      'button',
      {
        class: `btn ${mode === m ? 'active' : ''}`,
        type: 'button',
        'aria-pressed': String(mode === m),
        onclick: () => switchMode(m),
      },
      text,
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
      h(
        'button',
        { class: 'btn', type: 'button', onclick: () => fill(mode === 'day' ? activeDay : null) },
        mode === 'day' ? T.fillDayWithA : T.fillMonthWithA,
      ),
      ...(mode === 'day'
        ? [h('button', { class: 'btn', type: 'button', onclick: () => fill(null) }, T.fillMonthWithA)]
        : []),
      h('button', { class: 'btn', type: 'button', onclick: undo }, `↶ ${T.undo}`),
      h('button', { class: 'btn', type: 'button', onclick: () => void editDays() }, T.changeDays),
    );
  }

  function noteCell(f: number): HTMLElement {
    return h(
      'button',
      { class: 'note-cell', type: 'button', title: T.specialNote, onclick: () => void specialNote(f) },
      noteOf(f),
    );
  }

  function specialButton(f: number): HTMLElement {
    return h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        title: T.specialNote,
        'aria-label': `${T.specialNote}: ${c.students[f].name}`,
        onclick: () => void specialNote(f),
      },
      T.noteButton,
    );
  }

  function legend(): HTMLElement {
    return h(
      'p',
      { class: 'muted attendance-legend' },
      ATTENDANCE_CODES.map((code) => `${code} = ${T.attendanceCodeNames[code]}`).join('  ·  '),
    );
  }

  function renderGrid(): void {
    const table = h(
      'table',
      { class: 'grades-table attendance-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { class: 'col-num' }, NUMBER_HEADER),
          h('th', { class: 'col-name' }, NAME_HEADER),
          am.days.map((_, k) => h('th', { class: 'col-day', title: dayLabel(k) }, String(am.days[k]))),
          h('th', { class: 'col-summary' }, T.observations),
          h('th', { class: 'col-special' }, ''),
        ),
      ),
      h(
        'tbody',
        {},
        c.students.map((s, f) => {
          const tr = h('tr', { class: isAttendanceComplete(s, am) ? 'complete' : '' });
          tr.append(h('td', { class: 'col-num' }, String(f + 1)), h('td', { class: 'col-name' }, s.name));
          if (noteOf(f) !== '') {
            tr.append(h('td', { colspan: am.days.length + 1 }, noteCell(f)));
          } else {
            am.days.forEach((_, k) => {
              const value = markOf(f, k);
              tr.append(
                h(
                  'td',
                  { class: 'col-day' },
                  h(
                    'button',
                    {
                      class: `cell ${f === row && k === col ? 'selected' : ''} ${value === '' ? 'empty' : ''}`,
                      type: 'button',
                      'data-f': f,
                      'data-k': k,
                      'aria-label': `${s.name}, ${dayLabel(k)}: ${value || T.emptyCell}`,
                      onclick: () => {
                        row = f;
                        col = k;
                        render();
                      },
                    },
                    value,
                  ),
                ),
              );
            });
            tr.append(h('td', { class: 'col-summary' }, summarize(s.attendance[month]?.marks ?? [])));
          }
          tr.append(h('td', { class: 'col-special' }, specialButton(f)));
          return tr;
        }),
      ),
    );
    body.append(
      legend(),
      h('div', { class: 'table-scroll' }, table),
      h('p', { class: 'muted keys-help' }, T.attendanceKeysHelp),
    );
  }

  function markButtons(f: number, k: number, advance: boolean): HTMLElement[] {
    const current = markOf(f, k);
    return ATTENDANCE_CODES.map((code) =>
      h(
        'button',
        {
          class: `btn btn-grade ${current === code ? 'active' : ''}`,
          type: 'button',
          'aria-pressed': String(current === code),
          'aria-label': `${c.students[f].name}: ${T.attendanceCodeNames[code]}`,
          onclick: () => setMark(f, k, !advance && current === code ? '' : code, advance),
        },
        code,
      ),
    );
  }

  function renderKeypad(): void {
    clearChildren(keypad);
    if (mode !== 'grid') return;
    const s = c.students[row];
    if (!s) return;
    keypad.append(
      h('div', { class: 'keypad-info' }, `${row + 1}. ${s.name}`, h('span', { class: 'muted' }, ` — ${dayLabel(col)}`)),
      h(
        'div',
        { class: 'keypad-buttons' },
        markButtons(row, col, true),
        h('button', { class: 'btn btn-grade', type: 'button', onclick: () => setMark(row, col, '', false) }, T.erase),
      ),
    );
  }

  /** Shows day k from its first student (the list may have been scrolled to the bottom). */
  function openDay(k: number): void {
    activeDay = k;
    render();
    body.querySelector('.grade-list')?.scrollIntoView({ block: 'start' });
  }

  function renderByDay(): void {
    if (activeDay >= am.days.length) activeDay = 0;
    const nav = h(
      'div',
      { class: 'day-nav' },
      h(
        'button',
        { class: 'btn', type: 'button', disabled: activeDay === 0, onclick: () => openDay(activeDay - 1) },
        T.previousDay,
      ),
      h('strong', { class: 'day-nav-label' }, dayLabel(activeDay)),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          disabled: activeDay === am.days.length - 1,
          onclick: () => openDay(activeDay + 1),
        },
        T.nextDay,
      ),
    );
    const list = h(
      'div',
      { class: 'grade-list' },
      c.students.map((s, f) =>
        h(
          'div',
          { class: `grade-row ${noteOf(f) === '' && markOf(f, activeDay) !== '' ? 'complete' : ''}` },
          h('div', { class: 'grade-row-name' }, h('span', { class: 'num' }, String(f + 1)), h('span', {}, s.name)),
          noteOf(f) !== '' ? noteCell(f) : h('div', { class: 'grade-buttons' }, markButtons(f, activeDay, false)),
          specialButton(f),
        ),
      ),
    );
    body.append(legend(), nav, list);
    if (activeDay < am.days.length - 1)
      body.append(nextStepButton(T.nextDayButton(dayLabel(activeDay + 1)), () => openDay(activeDay + 1)));
  }

  /** Like the conduct screen: if other months or classes are still pending, list them instead of offering step 3. */
  function renderFooter(): void {
    clearChildren(footer);
    const warning = monthsWarning('attendance', getData().classes, { classId: id, month });
    const back = h(
      'button',
      { class: 'btn', type: 'button', onclick: () => goTo(`#/class/${id}/attendance`) },
      T.backToMonths,
    );
    footer.append(
      warning ?? h('span'),
      h(
        'div',
        { class: 'actions spaced' },
        back,
        warning
          ? null
          : h(
              'button',
              { class: 'btn btn-primary', type: 'button', onclick: () => goTo(`#/export/attendance/${month}`) },
              T.nextDownload,
            ),
      ),
    );
  }

  function render(): void {
    const scroll = window.scrollY;
    clearChildren(body);
    renderProgress();
    renderToolbar();
    if (c.students.length === 0) {
      body.append(
        h('p', {}, T.classWithoutStudents),
        h(
          'button',
          { class: 'btn btn-primary', type: 'button', onclick: () => goTo(`#/class/${id}/details`) },
          T.addStudent,
        ),
      );
    } else if (mode === 'grid') {
      if (row >= c.students.length) row = c.students.length - 1;
      if (col >= am.days.length) col = 0;
      renderGrid();
    } else {
      renderByDay();
    }
    renderKeypad();
    renderFooter();
    if (mode === 'grid') {
      body.querySelector<HTMLElement>('.cell.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else window.scrollTo(0, scroll);
  }

  // ---------- Keyboard ----------
  const onKeydown = gridKeydown({
    active: () => mode === 'grid' && c.students.length > 0,
    rowCount: () => c.students.length,
    colCount: () => am.days.length,
    position: () => ({ row, col }),
    moveTo: (r, k) => {
      row = r;
      col = k;
      render();
    },
    undo,
    clearCell: () => setMark(row, col, '', false),
    valueFor: (letter) => KEY_TO_MARK[letter] ?? null,
    enter: (value) => setMark(row, col, value, true),
  });
  document.addEventListener('keydown', onKeydown);

  root.append(
    h(
      'div',
      { class: 'grades-header' },
      stepsBanner(2),
      h(
        'button',
        { class: 'btn btn-text', type: 'button', onclick: () => goTo(`#/class/${id}/attendance`) },
        T.backToMonths,
      ),
      h('h1', {}, `${c.label} — ${monthName(month)}`),
      h('p', { class: c.tutor ? 'muted' : 'muted missing' }, c.tutor ? formatTutor(c) : T.tutorMissing),
    ),
    autosaveBanner(),
    progressEl,
    toolbar,
    body,
    keypad,
    footer,
  );
  render();
  return { el: root, destroy: () => document.removeEventListener('keydown', onKeydown) };
}
