import { h, clearChildren, confirmDialog, notice, progressBar } from '../ui/dom';
import { T } from '../ui/texts';
import { stepsBanner } from '../ui/steps';
import { change, findClass, getData } from '../storage/store';
import { monthName } from '../domain/attendance';
import { NORMS_GRADES, type SchoolClass } from '../domain/model';
import {
  clearQuarter,
  hasSpecialNote,
  isQuarterComplete,
  quarterGrade,
  quarterOf,
  setQuarterGrade,
} from '../domain/quarter';
import { monthsOf } from './export-report';
import { nextStepButton } from './grid-keys';
import { autosaveBanner } from './saving-banner';
import { goTo, type View } from './view';

export const QUARTER_GUIDE = '#/quarter';
export const quarterEntryRoute = (id: string): string => `#/class/${id}/quarter`;
export const QUARTER_EXPORT = '#/export/quarter';

/** Students of a class whose quarter report is complete. */
export function quarterProgress(c: SchoolClass): { done: number; total: number } {
  const { settings } = getData();
  return { done: c.students.filter((s) => isQuarterComplete(s, settings)).length, total: c.students.length };
}

/**
 * The months of the current quarter, chosen once for every class (they are the same school months), and the
 * button that starts the next quarter. Shown at the top of step 2 of the quarter guide.
 */
export function quarterMonthsBlock(): HTMLElement {
  const { classes, settings } = getData();
  const all = [...new Set([...monthsOf(classes), ...settings.quarterMonths])].sort();
  const block = h('div', { class: 'quarter-months' }, h('h3', {}, T.quarterMonths));
  if (all.length === 0) {
    block.append(h('p', { class: 'muted' }, T.quarterNoMonths));
    return block;
  }
  block.append(
    h('p', { class: 'muted' }, T.quarterMonthsHelp),
    h(
      'div',
      { class: 'class-chips' },
      all.map((m) => {
        const checkbox = h('input', { type: 'checkbox', class: 'checkbox', id: `quarter-month-${m}` });
        checkbox.checked = settings.quarterMonths.includes(m);
        checkbox.addEventListener('change', () => {
          change((d) => {
            const chosen = new Set(d.settings.quarterMonths);
            if (checkbox.checked) chosen.add(m);
            else chosen.delete(m);
            d.settings.quarterMonths = [...chosen].sort();
          });
        });
        return h('label', { class: 'class-chip', for: `quarter-month-${m}` }, checkbox, monthName(m));
      }),
    ),
    ...(settings.quarterMonths.length === 0 ? [h('p', { class: 'missing' }, T.quarterChooseMonths)] : []),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          class: 'btn btn-danger-soft',
          type: 'button',
          onclick: async () => {
            if (!(await confirmDialog(T.quarterNewTitle, T.quarterNewText, T.quarterNewAccept, true))) return;
            change((d) => clearQuarter(d.classes, d.settings));
            notice(T.quarterNewDone, 'ok');
          },
        },
        T.quarterNew,
      ),
    ),
  );
  return block;
}

/** Quarter grades of one class: one student at a time, each criterion with its suggestion and big buttons. */
export function quarterView(id: string): View {
  const root = h('div', { class: 'screen screen-grades' });
  const found = findClass(id);
  if (!found) {
    root.append(
      h('p', {}, T.notFound),
      h('button', { class: 'btn', type: 'button', onclick: () => goTo(QUARTER_GUIDE) }, T.backToQuarter),
    );
    return { el: root };
  }
  const c: SchoolClass = found;
  let student = 0;

  const progressEl = h('div', { class: 'grades-progress' });
  const picker = h('div', { class: 'student-picker' });
  const card = h('div', { class: 'quarter-student' });
  const footer = h('div', { class: 'grades-footer' });
  const settings = () => getData().settings;

  function renderProgress(): void {
    const { done, total } = quarterProgress(c);
    clearChildren(progressEl);
    progressEl.append(progressBar(done, total), h('span', { class: 'muted' }, T.completed(done, total)));
  }

  function renderPicker(): void {
    clearChildren(picker);
    const select = h(
      'select',
      { class: 'field', 'aria-label': T.student },
      c.students.map((s, i) =>
        h(
          'option',
          { value: i, selected: i === student },
          `${isQuarterComplete(s, settings()) ? '✓ ' : ''}${i + 1}. ${s.name}`,
        ),
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

  /** One criterion: what the daily grades say, the suggested grade and the four big buttons. */
  function criterionRow(row: number): HTMLElement {
    const s = c.students[student];
    const q = quarterGrade(s, settings(), row);
    const name = settings().quarterCriteria[row].name;
    const total = q.counts.reduce((a, b) => a + b, 0);
    const counts =
      total === 0
        ? T.quarterNoDailyGrades
        : T.quarterCounts(NORMS_GRADES.map((g, k) => `${q.counts[k]} ${g}`).join(', '));
    const badge = q.byHand
      ? h('span', { class: 'quarter-badge by-hand' }, T.quarterByHand)
      : q.grade !== ''
        ? h('span', { class: 'quarter-badge' }, T.quarterSuggested)
        : null;
    const note = h('input', {
      type: 'text',
      class: 'field',
      id: `quarter-note-${row}`,
      value: s.quarter?.notes[row] ?? '',
      placeholder: T.quarterNotePlaceholder,
      autocomplete: 'off',
    });
    // Saved when she leaves the field, without re-rendering, so the next tap is not lost
    note.addEventListener('change', () =>
      change(() => (quarterOf(s, settings().quarterCriteria.length).notes[row] = note.value.trim()), false),
    );
    return h(
      'div',
      { class: `grade-row quarter-row ${q.grade !== '' ? 'complete' : ''}` },
      h('div', { class: 'grade-row-name' }, h('span', {}, `${row + 1}. ${name}`), badge),
      h('p', { class: 'muted quarter-counts' }, counts, q.byHand && q.suggested ? ` ${T.quarterWas(q.suggested)}` : ''),
      h(
        'div',
        { class: 'grade-buttons' },
        NORMS_GRADES.map((g) =>
          h(
            'button',
            {
              class: `btn btn-grade ${q.grade === g ? 'active' : ''}`,
              type: 'button',
              'aria-pressed': String(q.grade === g),
              'aria-label': `${name}: ${g}`,
              onclick: () => {
                // Tapping her own grade again goes back to the suggestion
                const value = q.byHand && q.grade === g ? '' : g;
                change(() => {
                  if (value === '') quarterOf(s, settings().quarterCriteria.length).grades[row] = '';
                  else setQuarterGrade(s, settings(), row, value);
                }, false);
                refresh();
              },
            },
            g,
          ),
        ),
      ),
      h('label', { class: 'quarter-note-label', for: `quarter-note-${row}` }, T.quarterNoteLabel),
      note,
    );
  }

  function renderCard(): void {
    clearChildren(card);
    const s = c.students[student];
    card.append(
      h('h2', {}, `${T.studentOf(student + 1, c.students.length)}: ${s.name}`),
      ...(hasSpecialNote(s, settings().quarterMonths)
        ? [h('p', { class: 'warning-banner' }, T.quarterSpecialNote(s.note || T.quarterAttendanceNote))]
        : []),
      ...settings().quarterCriteria.map((_, row) => criterionRow(row)),
    );
    if (student < c.students.length - 1)
      card.append(nextStepButton(T.nextStudentButton(c.students[student + 1].name), () => selectStudent(student + 1)));
  }

  function renderFooter(): void {
    clearChildren(footer);
    footer.append(
      h(
        'div',
        { class: 'actions spaced' },
        h('button', { class: 'btn', type: 'button', onclick: () => goTo(QUARTER_GUIDE) }, T.backToQuarter),
        h(
          'button',
          {
            class: `btn ${student === c.students.length - 1 ? 'btn-primary' : ''}`,
            type: 'button',
            onclick: () => goTo(`${QUARTER_EXPORT}/${id}`),
          },
          T.nextDownload,
        ),
      ),
    );
  }

  /** After a tap: only this student's card, the progress and the picker change; the page does not jump. */
  function refresh(): void {
    const scroll = window.scrollY;
    renderProgress();
    renderPicker();
    renderCard();
    window.scrollTo(0, scroll);
  }

  function selectStudent(i: number): void {
    student = Math.max(0, Math.min(c.students.length - 1, i));
    refresh();
    renderFooter();
    picker.scrollIntoView({ block: 'start' });
  }

  const months = settings().quarterMonths;
  root.append(
    h(
      'div',
      { class: 'grades-header' },
      stepsBanner(2),
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo(QUARTER_GUIDE) }, T.backToQuarter),
      h('h1', {}, `${c.label} — ${T.quarterReport}`),
      h(
        'p',
        { class: months.length > 0 ? 'muted' : 'muted missing' },
        months.length > 0 ? T.quarterMonthsList(months.map(monthName).join(', ')) : T.quarterChooseMonths,
        ' ',
        h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo(QUARTER_GUIDE) }, T.quarterChange),
      ),
    ),
    autosaveBanner(),
  );
  if (c.students.length === 0) {
    root.append(
      h('p', {}, T.classWithoutStudents),
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', onclick: () => goTo(`#/class/${id}/details`) },
        T.addStudent,
      ),
    );
    return { el: root };
  }
  root.append(h('p', { class: 'muted' }, T.quarterEntryHelp), progressEl, picker, card, footer);
  refresh();
  renderFooter();
  return { el: root };
}
