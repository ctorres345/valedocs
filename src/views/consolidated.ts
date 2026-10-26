import { h, clearChildren, notice, download, MIME_PDF, MIME_XLSX, tabList } from '../ui/dom';
import { T } from '../ui/texts';
import { stepsBanner } from '../ui/steps';
import { getData } from '../storage/store';
import { findMonth, isAttendanceComplete, monthName } from '../domain/attendance';
import {
  COUNTED_CODES,
  CONSOLIDATED_GROUP_HEADER,
  TOTAL_CODES,
  TOTAL_HEADER,
  buildConsolidatedReport,
  initialMonths,
  rowCells,
  type MonthChoice,
  type ConsolidatedReport,
} from '../domain/consolidated-layout';
import { NAME_HEADER, NUMBER_HEADER, baseFileName } from '../domain/report-layout';
import type { SchoolClass } from '../domain/model';
import { finishPanel, monthsOf, sheetHeader } from './export-report';
import { goTo, include, includedClasses, isIncluded, type View } from './view';

/** On-screen preview: same columns and merged notes as the Excel and PDF files. */
function consolidatedSheet(r: ConsolidatedReport): HTMLElement {
  const per = COUNTED_CODES.length;
  return h(
    'div',
    { class: 'sheet sheet-consolidated' },
    sheetHeader(r),
    h('div', { class: 'sheet-term' }, r.title),
    h('div', { class: 'sheet-class' }, h('span', {}, r.label)),
    h(
      'table',
      { class: 'sheet-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { rowspan: 3 }, NUMBER_HEADER),
          h('th', { rowspan: 3 }, NAME_HEADER),
          r.months.length > 0 ? h('th', { colspan: r.months.length * per }, CONSOLIDATED_GROUP_HEADER) : null,
          h('th', { colspan: per, rowspan: 2 }, TOTAL_HEADER),
        ),
        h(
          'tr',
          {},
          r.months.map((m) => h('th', { colspan: per }, m)),
        ),
        h(
          'tr',
          {},
          r.months.flatMap(() => COUNTED_CODES.map((c) => h('th', { class: 'count' }, c))),
          TOTAL_CODES.map((c) => h('th', { class: 'count' }, c)),
        ),
      ),
      h(
        'tbody',
        {},
        r.rows.map((f) => {
          const { values, note } = rowCells(f);
          const totalsStart = r.months.length * per;
          return h(
            'tr',
            {},
            h('td', { class: 'c' }, String(f.position)),
            h('td', { class: 'name' }, f.name),
            values.map((v, k) => h('td', { class: k >= totalsStart ? 'c count total' : 'c count' }, v)),
            note ? h('td', { class: 'c note', colspan: note.span }, f.note) : null,
          );
        }),
      ),
    ),
  );
}

const MONTHS_KEY = 'valedocs:consolidated-months';

/** Her last month choice on this device (null when there is none or it cannot be read). */
function savedMonths(): MonthChoice | null {
  try {
    const saved = JSON.parse(localStorage.getItem(MONTHS_KEY) ?? 'null') as Partial<MonthChoice> | null;
    const list = (x: unknown): string[] | null =>
      Array.isArray(x) && x.every((m) => typeof m === 'string') ? (x as string[]) : null;
    const chosen = list(saved?.chosen);
    const seen = list(saved?.seen);
    return chosen && seen ? { chosen, seen } : null;
  } catch {
    return null;
  }
}

function saveMonths(choice: MonthChoice): void {
  try {
    localStorage.setItem(MONTHS_KEY, JSON.stringify(choice));
  } catch {
    /* not critical: she ticks them again next time */
  }
}

/** Months chosen for the consolidated report. */
let chosenMonths: Set<string> | null = null;
/** Excel layout: every class in one sheet (like her file) or one sheet per class. */
let oneSheet = true;

/** Consolidated absences and tardies of several months, computed from the attendance she already marked. */
export function consolidatedView(): View {
  const root = h('div', { class: 'screen' });
  let previewClass: string | null = null;
  let busy = false;

  const months = (): string[] => [...(chosenMonths ?? [])].sort();
  /** Included classes that have at least one chosen month. */
  const eligible = (classes: SchoolClass[]): SchoolClass[] =>
    classes.filter((c) => months().some((m) => findMonth(c, m)));

  async function run(action: 'xlsx' | 'pdf', buttons: HTMLButtonElement[], status: HTMLElement): Promise<void> {
    const { classes, settings } = getData();
    const selected = includedClasses(eligible(classes));
    if (months().length === 0) return notice(T.consolidatedChooseMonths, 'error');
    if (selected.length === 0) return notice(T.chooseClassesFirst, 'error');
    if (busy) return;
    busy = true;
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = T.generating;
    try {
      const base = baseFileName(T.consolidatedPrefix, selected, settings.term);
      if (action === 'pdf') {
        const { buildConsolidatedPdf } = await import('../export/build-pdf');
        download(buildConsolidatedPdf(selected, months(), settings), `${base}.pdf`, MIME_PDF);
      } else {
        const { buildConsolidatedWorkbook } = await import('../export/build-xlsx');
        download(await buildConsolidatedWorkbook(selected, months(), settings, oneSheet), `${base}.xlsx`, MIME_XLSX);
      }
      notice(T.downloadReady, 'ok');
    } catch (err) {
      console.error(err);
      notice(T.generalError, 'error');
    } finally {
      status.textContent = '';
      buttons.forEach((b) => (b.disabled = false));
      busy = false;
    }
  }

  /** What may be wrong in the chosen months: unmarked students, or a class that lacks one of the months. */
  function warning(selected: SchoolClass[]): HTMLElement {
    const lines = selected.flatMap((c) =>
      months().flatMap((m) => {
        const am = findMonth(c, m);
        if (!am)
          return [
            h('li', {}, h('span', {}, h('strong', {}, `${c.label}, ${monthName(m)}`), `: ${T.consolidatedNoMonth}`)),
          ];
        const n = c.students.filter((s) => !isAttendanceComplete(s, am)).length;
        if (n === 0) return [];
        return [
          h(
            'li',
            {},
            h('span', {}, h('strong', {}, `${c.label}, ${monthName(m)}`), `: ${T.pendingStudents(n)}`),
            h(
              'button',
              { class: 'btn btn-primary', type: 'button', onclick: () => goTo(`#/class/${c.id}/attendance/${m}`) },
              T.completeMonth(c.label, monthName(m)),
            ),
          ),
        ];
      }),
    );
    return lines.length === 0
      ? h('div', { class: 'success-banner' }, `✓ ${T.consolidatedAllMarked}`)
      : h(
          'div',
          { class: 'warning-banner' },
          h('strong', {}, T.consolidatedPending),
          h('ul', { class: 'pending-list' }, lines),
          h('p', { class: 'muted' }, T.consolidatedPendingHint),
        );
  }

  function render(): void {
    const scroll = window.scrollY; // keep her place when ticking a month far down the page
    clearChildren(root);
    const { classes, settings } = getData();
    root.append(
      stepsBanner(3),
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/attendance') }, T.backToAttendance),
      h('h1', {}, T.consolidatedTitle),
      h('p', { class: 'muted' }, T.consolidatedIntro),
    );
    const all = monthsOf(includedClasses(classes));
    if (all.length === 0) {
      root.append(
        h('p', {}, T.noMonthsYet),
        h(
          'button',
          { class: 'btn btn-primary', type: 'button', onclick: () => goTo('#/attendance') },
          T.backToAttendance,
        ),
      );
      return;
    }
    // Starts with her last choice (months opened since then are ticked); months that no longer exist are dropped
    chosenMonths = new Set(chosenMonths ? all.filter((m) => chosenMonths!.has(m)) : initialMonths(all, savedMonths()));

    root.append(
      h('h2', {}, T.consolidatedMonths),
      h(
        'div',
        { class: 'class-chips' },
        all.map((m) => {
          const checkbox = h('input', { type: 'checkbox', class: 'checkbox', id: `month-${m}` });
          checkbox.checked = chosenMonths!.has(m);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) chosenMonths!.add(m);
            else chosenMonths!.delete(m);
            saveMonths({ chosen: months(), seen: all });
            render();
          });
          return h('label', { class: 'class-chip', for: `month-${m}` }, checkbox, monthName(m));
        }),
      ),
      h(
        'p',
        { class: 'muted' },
        T.consolidatedTermHelp(settings.term),
        ' ',
        h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/settings') }, T.settings),
      ),
    );
    if (months().length === 0) {
      root.append(h('p', { class: 'muted' }, T.consolidatedChooseMonths), finishPanel());
      return;
    }

    root.append(
      h('h2', {}, T.chooseClasses),
      h(
        'div',
        { class: 'class-chips' },
        eligible(classes).map((c) => {
          const checkbox = h('input', { type: 'checkbox', class: 'checkbox', id: `export-${c.id}` });
          checkbox.checked = isIncluded(c.id);
          checkbox.addEventListener('change', () => {
            include(c.id, checkbox.checked);
            render();
          });
          return h('label', { class: 'class-chip', for: `export-${c.id}` }, checkbox, c.label);
        }),
      ),
    );
    const selected = includedClasses(eligible(classes));
    if (selected.length === 0) {
      root.append(h('p', { class: 'muted' }, T.chooseClassesFirst), finishPanel());
      return;
    }

    const status = h('p', { class: 'status', role: 'status' });
    const buttons: HTMLButtonElement[] = [];
    const excelButton = h(
      'button',
      { class: 'btn btn-primary', type: 'button', onclick: () => void run('xlsx', buttons, status) },
      T.downloadExcel,
    );
    const pdfButton = h(
      'button',
      { class: 'btn btn-primary', type: 'button', onclick: () => void run('pdf', buttons, status) },
      T.downloadPdf,
    );
    buttons.push(excelButton, pdfButton);

    if (!previewClass || !selected.some((c) => c.id === previewClass)) previewClass = selected[0].id;
    const layoutButton = (value: boolean, text: string): HTMLElement =>
      h(
        'button',
        {
          class: `btn ${oneSheet === value ? 'active' : ''}`,
          type: 'button',
          'aria-pressed': String(oneSheet === value),
          onclick: () => {
            oneSheet = value;
            render();
          },
        },
        text,
      );
    root.append(
      warning(selected),
      h('h2', {}, T.excelLayout),
      h(
        'div',
        { class: 'toggle', role: 'group', 'aria-label': T.excelLayout },
        layoutButton(true, T.layoutOneSheet),
        layoutButton(false, T.layoutPerClass),
      ),
      h('p', { class: 'muted' }, oneSheet ? T.layoutOneSheetHelp : T.layoutPerClassHelp),
      h('div', { class: 'actions' }, excelButton, pdfButton),
      status,
      tabList(
        T.chooseClasses,
        selected.map((c) => ({ key: c.id, text: c.label })),
        previewClass,
        (id) => {
          previewClass = id;
          render();
        },
      ),
      h(
        'div',
        { class: 'sheet-frame' },
        consolidatedSheet(
          buildConsolidatedReport(
            selected.find((c) => c.id === previewClass)!,
            settings,
            months(),
          ),
        ),
      ),
      finishPanel(),
    );
    window.scrollTo(0, scroll);
  }

  render();
  return { el: root };
}
