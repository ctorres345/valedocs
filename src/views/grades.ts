import { h, clearChildren, notice, ask, progressBar } from '../ui/dom';
import { T } from '../ui/texts';
import { findClass, change, getData } from '../storage/store';
import { NAME_HEADER, NUMBER_HEADER } from '../domain/report-layout';
import { formatTutor, isStudentComplete, progress, type SchoolClass, pendingOf, type Pending } from '../domain/model';
import { stepsBanner } from '../ui/steps';
import { createUndoStack, gridKeydown, isTouchLayout, loadMode, nextStepButton, saveMode } from './grid-keys';
import { autosaveBanner } from './saving-banner';
import { goTo, type View, isIncluded } from './view';

type Mode = 'grid' | 'column';
const MODE_KEY = 'valedocs:mode';
const MODES = ['grid', 'column'] as const;

function columnLabel(c: { line1: string; line2: string }): string {
  return c.line2.trim() ? `${c.line1} ${c.line2}` : c.line1;
}

export function gradesView(id: string): View {
  const root = h('div', { class: 'screen screen-grades' });
  const schoolClass = findClass(id);
  if (!schoolClass) {
    root.append(
      h('p', {}, T.notFound),
      h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/conduct') }, T.backToConduct),
    );
    return { el: root };
  }
  const c: SchoolClass = schoolClass;

  let mode = loadMode<Mode>(MODE_KEY, MODES, () => (isTouchLayout() ? 'column' : 'grid'));
  let row = 0;
  let col = 0;
  let activeCol = 0; // column shown in "by column" mode
  const undoStack = createUndoStack();

  const settings = () => getData().settings;
  const colCount = (): number => settings().columns.length;
  const allowed = (): string[] => settings().allowedGrades;

  const body = h('div', { class: 'grades-body' });
  const progressEl = h('div', { class: 'grades-progress' });
  const toolbar = h('div', { class: 'actions' });
  const keypad = h('div', { class: 'keypad' });
  const footer = h('div', { class: 'grades-footer' });

  // ---------- Changes with undo ----------
  function snapshot(): void {
    // Only what this screen edits: the students also carry attendance, norms and gender
    undoStack.push(JSON.stringify(c.students.map((s) => ({ grades: s.grades, note: s.note }))));
  }
  function undo(): void {
    const previous = undoStack.pop();
    if (!previous) return notice(T.nothingToUndo, 'info');
    const saved = JSON.parse(previous) as { grades: string[]; note: string }[];
    change(() =>
      c.students.forEach((s, i) => {
        if (!saved[i]) return;
        s.grades = saved[i].grades;
        s.note = saved[i].note;
      }),
    );
    render();
  }

  function nextRow(start: number): number {
    for (let i = start + 1; i < c.students.length; i++) if (c.students[i].note.trim() === '') return i;
    return start;
  }

  function setGrade(f: number, k: number, value: string, advance: boolean): void {
    const a = c.students[f];
    if (!a || a.note.trim() !== '') return;
    snapshot();
    change(() => (a.grades[k] = value));
    if (advance) row = nextRow(f);
    render();
  }

  async function specialNote(f: number): Promise<void> {
    const a = c.students[f];
    if (!a) return;
    const text = await ask(`${T.specialNoteTitle}: ${a.name}`, T.specialNoteText, a.note, T.suggestions);
    if (text === null) return;
    snapshot();
    change(() => (a.note = text));
    render();
  }

  function fill(onlyColumn: number | null): void {
    const value = allowed().includes('A') ? 'A' : (allowed()[0] ?? 'A');
    snapshot();
    let n = 0;
    change(() => {
      for (const a of c.students) {
        if (a.note.trim() !== '') continue;
        for (let k = 0; k < colCount(); k++) {
          if (onlyColumn !== null && k !== onlyColumn) continue;
          if (a.grades[k] === '') {
            a.grades[k] = value;
            n++;
          }
        }
      }
    });
    if (n === 0) undoStack.pop();
    if (n === 0) notice(T.noEmptyCells, 'info');
    else notice(T.filled(n), 'ok', { label: `↶ ${T.undo}`, run: undo });
    render();
  }

  // ---------- Rendering ----------
  function renderProgress(): void {
    const { doneCount, total } = progress(c);
    clearChildren(progressEl);
    progressEl.append(progressBar(doneCount, total), h('span', { class: 'muted' }, T.completed(doneCount, total)));
  }

  function renderToolbar(): void {
    clearChildren(toolbar);
    toolbar.append(
      h(
        'div',
        { class: 'toggle', role: 'group', 'aria-label': T.entryMode },
        h(
          'button',
          {
            class: `btn ${mode === 'grid' ? 'active' : ''}`,
            type: 'button',
            'aria-pressed': String(mode === 'grid'),
            onclick: () => switchMode('grid'),
          },
          T.grid,
        ),
        h(
          'button',
          {
            class: `btn ${mode === 'column' ? 'active' : ''}`,
            type: 'button',
            'aria-pressed': String(mode === 'column'),
            onclick: () => switchMode('column'),
          },
          T.byColumn,
        ),
      ),
      h(
        'button',
        { class: 'btn', type: 'button', onclick: () => fill(mode === 'column' ? activeCol : null) },
        mode === 'column' ? T.fillColumnWithA : T.fillWithA,
      ),
      ...(mode === 'column'
        ? [h('button', { class: 'btn', type: 'button', onclick: () => fill(null) }, T.fillClassWithA)]
        : []),
      h('button', { class: 'btn', type: 'button', onclick: undo }, `↶ ${T.undo}`),
    );
  }

  function switchMode(m: Mode): void {
    mode = m;
    saveMode(MODE_KEY, m);
    render();
  }

  function noteCell(f: number): HTMLElement {
    const a = c.students[f];
    return h(
      'button',
      { class: 'note-cell', type: 'button', title: T.specialNote, onclick: () => void specialNote(f) },
      a.note,
    );
  }

  function renderGrid(): void {
    const cols = settings().columns;
    const table = h(
      'table',
      { class: 'grades-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { class: 'col-num' }, NUMBER_HEADER),
          h('th', { class: 'col-name' }, NAME_HEADER),
          cols.map((x) => h('th', { class: 'col-grade' }, x.line1, x.line2.trim() ? h('br') : null, x.line2)),
          h('th', { class: 'col-special' }, ''),
        ),
      ),
      h(
        'tbody',
        {},
        c.students.map((a, f) => {
          const tr = h('tr', { class: isStudentComplete(a) ? 'complete' : '' });
          tr.append(h('td', { class: 'col-num' }, String(f + 1)), h('td', { class: 'col-name' }, a.name));
          if (a.note.trim() !== '') {
            tr.append(h('td', { colspan: cols.length }, noteCell(f)));
          } else {
            cols.forEach((_, k) => {
              const value = a.grades[k] ?? '';
              const selected = f === row && k === col;
              tr.append(
                h(
                  'td',
                  { class: 'col-grade' },
                  h(
                    'button',
                    {
                      class: `cell ${selected ? 'selected' : ''} ${value === '' ? 'empty' : ''}`,
                      type: 'button',
                      'data-f': f,
                      'data-k': k,
                      'aria-label': `${a.name}, ${columnLabel(cols[k])}: ${value || T.emptyCell}`,
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
          }
          tr.append(
            h(
              'td',
              { class: 'col-special' },
              h(
                'button',
                {
                  class: 'btn btn-small',
                  type: 'button',
                  title: T.specialNote,
                  'aria-label': `${T.specialNote}: ${a.name}`,
                  onclick: () => void specialNote(f),
                },
                T.noteButton,
              ),
            ),
          );
          return tr;
        }),
      ),
    );
    body.append(h('div', { class: 'table-scroll' }, table), h('p', { class: 'muted keys-help' }, T.keysHelp));
  }

  function renderKeypad(): void {
    clearChildren(keypad);
    if (mode !== 'grid') return;
    const a = c.students[row];
    if (!a) return;
    const cols = settings().columns;
    keypad.append(
      h(
        'div',
        { class: 'keypad-info' },
        `${row + 1}. ${a.name}`,
        h('span', { class: 'muted' }, ` — ${columnLabel(cols[col] ?? cols[0])}`),
      ),
      h(
        'div',
        { class: 'keypad-buttons' },
        allowed().map((n) =>
          h(
            'button',
            {
              class: `btn btn-grade ${a.grades[col] === n ? 'active' : ''}`,
              type: 'button',
              onclick: () => setGrade(row, col, n, true),
            },
            n,
          ),
        ),
        h('button', { class: 'btn btn-grade', type: 'button', onclick: () => setGrade(row, col, '', false) }, T.erase),
      ),
    );
  }

  /** Every student without a special note has a grade in column k. */
  function columnComplete(k: number): boolean {
    return c.students.every((a) => a.note.trim() !== '' || (a.grades[k] ?? '') !== '');
  }

  function openColumn(k: number): void {
    activeCol = k;
    render();
    // A new column starts at the first student, not where the previous list was scrolled to
    body.querySelector('.column-position')?.scrollIntoView({ block: 'start' });
    // On a phone the tabs scroll sideways: bring the chosen one into sight
    const tab = body.querySelector<HTMLElement>('.tab.active');
    const strip = tab?.parentElement;
    if (tab && strip) strip.scrollLeft += tab.getBoundingClientRect().left - strip.getBoundingClientRect().left - 8;
  }

  function renderByColumn(): void {
    const cols = settings().columns;
    if (activeCol >= cols.length) activeCol = 0;
    const tabs = h(
      'div',
      { class: 'tabs', role: 'tablist', 'aria-label': T.column },
      cols.map((x, k) =>
        h(
          'button',
          {
            class: `tab ${k === activeCol ? 'active' : ''} ${columnComplete(k) ? 'tab-done' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': String(k === activeCol),
            'aria-label': columnComplete(k) ? `${columnLabel(x)}, ${T.columnDone}` : columnLabel(x),
            onclick: () => openColumn(k),
          },
          columnComplete(k) ? `✓ ${columnLabel(x)}` : columnLabel(x),
        ),
      ),
    );
    const position = h('p', { class: 'muted column-position' }, T.columnPosition(activeCol + 1, cols.length));
    const list = h(
      'div',
      { class: 'grade-list' },
      c.students.map((a, f) =>
        h(
          'div',
          { class: `grade-row ${a.note.trim() === '' && (a.grades[activeCol] ?? '') !== '' ? 'complete' : ''}` },
          h('div', { class: 'grade-row-name' }, h('span', { class: 'num' }, String(f + 1)), h('span', {}, a.name)),
          a.note.trim() !== ''
            ? noteCell(f)
            : h(
                'div',
                { class: 'grade-buttons' },
                allowed().map((n) =>
                  h(
                    'button',
                    {
                      class: `btn btn-grade ${a.grades[activeCol] === n ? 'active' : ''}`,
                      type: 'button',
                      'aria-pressed': String(a.grades[activeCol] === n),
                      'aria-label': `${a.name}: ${n}`,
                      onclick: () => setGrade(f, activeCol, a.grades[activeCol] === n ? '' : n, false),
                    },
                    n,
                  ),
                ),
              ),
          h(
            'button',
            {
              class: 'btn btn-small',
              type: 'button',
              title: T.specialNote,
              'aria-label': `${T.specialNote}: ${a.name}`,
              onclick: () => void specialNote(f),
            },
            T.noteButton,
          ),
        ),
      ),
    );
    const next = activeCol + 1 < cols.length ? activeCol + 1 : null;
    body.append(tabs, position, list);
    if (next !== null) body.append(nextStepButton(T.nextColumn(columnLabel(cols[next])), () => openColumn(next)));
  }

  /**
   * End of the screen. If other classes she selected still have pending work (grades or tutor name),
   * say so and offer to jump to them; otherwise offer the next step.
   */
  function renderFooter(): void {
    clearChildren(footer);
    const others = getData()
      .classes.filter((o) => o.id !== id && isIncluded(o.id))
      .map((o) => ({ schoolClass: o, pending: pendingOf(o) }))
      .filter((x): x is { schoolClass: SchoolClass; pending: Pending } => x.pending !== null);

    const detailsButton = h(
      'button',
      { class: 'btn', type: 'button', onclick: () => goTo(`#/class/${id}/details`) },
      T.classDetails,
    );
    if (others.length === 0) {
      footer.append(
        h(
          'div',
          { class: 'actions spaced' },
          detailsButton,
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => goTo('#/export') }, T.nextDownload),
        ),
      );
      return;
    }
    footer.append(
      h(
        'div',
        { class: 'warning-banner spaced', role: 'status' },
        h('strong', {}, others.length === 1 ? T.pendingOne : T.pendingMany),
        h(
          'ul',
          { class: 'pending-list' },
          others.map(({ schoolClass: o, pending }) => {
            const reasons = [
              pending.incompleteStudents > 0 ? T.pendingStudents(pending.incompleteStudents) : null,
              pending.missingTutor ? T.pendingTutor : null,
            ].filter((x): x is string => x !== null);
            // Grades are completed on the grades screen; a missing tutor name on the details screen
            const target = pending.incompleteStudents > 0 ? `#/class/${o.id}` : `#/class/${o.id}/details`;
            return h(
              'li',
              {},
              h('span', {}, h('strong', {}, o.label), `: ${reasons.join(' y ')}`),
              h(
                'button',
                { class: 'btn btn-primary', type: 'button', onclick: () => goTo(target) },
                T.completeClass(o.label),
              ),
            );
          }),
        ),
        h('p', { class: 'muted' }, T.pendingHint),
      ),
      h('div', { class: 'actions' }, detailsButton),
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
      if (col >= colCount()) col = 0;
      renderGrid();
    } else {
      renderByColumn();
    }
    renderKeypad();
    renderFooter();
    if (mode === 'grid') {
      const selected = body.querySelector<HTMLElement>('.cell.selected');
      selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else window.scrollTo(0, scroll);
  }

  // ---------- Keyboard ----------
  const onKeydown = gridKeydown({
    active: () => mode === 'grid' && c.students.length > 0,
    rowCount: () => c.students.length,
    colCount,
    position: () => ({ row, col }),
    moveTo: (r, k) => {
      row = r;
      col = k;
      render();
    },
    undo,
    clearCell: () => setGrade(row, col, '', false),
    valueFor: (letter) =>
      allowed().includes(letter) ? letter : letter === 'D' && allowed().includes('AD') ? 'AD' : null,
    enter: (value) => setGrade(row, col, value, true),
  });
  document.addEventListener('keydown', onKeydown);

  root.append(
    h(
      'div',
      { class: 'grades-header' },
      stepsBanner(2),
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/conduct') }, T.backToConduct),
      h('h1', {}, c.label),
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
