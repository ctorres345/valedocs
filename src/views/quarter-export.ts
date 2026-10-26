import { h, clearChildren, notice, download, tabList, MIME_PDF } from '../ui/dom';
import { T } from '../ui/texts';
import { stepsBanner } from '../ui/steps';
import { getData } from '../storage/store';
import { monthName } from '../domain/attendance';
import { isQuarterComplete, quarterStudents } from '../domain/quarter';
import { QUARTER_LABELS, buildQuarterSheet, type QuarterSheet } from '../domain/quarter-layout';
import { baseFileName } from '../domain/report-layout';
import type { SchoolClass } from '../domain/model';
import { getLogos } from '../storage/logos';
import { finishPanel } from './export-report';
import { QUARTER_GUIDE, quarterEntryRoute } from './quarter';
import { goTo, include, includedClasses, isIncluded, type View } from './view';

/** On-screen preview of one strip: same boxes and circled grade as the PDF. */
export function quarterStrip(r: QuarterSheet): HTMLElement {
  const L = QUARTER_LABELS;
  const logo = getLogos().left;
  return h(
    'div',
    { class: 'sheet quarter-sheet' },
    h(
      'div',
      { class: 'quarter-school' },
      logo ? h('img', { src: logo.uri, alt: '' }) : null,
      h('div', {}, h('div', {}, r.institution1), h('div', {}, r.institution2)),
    ),
    h('div', { class: 'sheet-title' }, r.term, h('br'), r.title),
    h(
      'table',
      { class: 'sheet-table quarter-info' },
      h(
        'tbody',
        {},
        h('tr', {}, h('th', {}, L.name), h('td', { colspan: 3 }, r.name)),
        h('tr', {}, h('th', {}, L.course), h('td', {}, r.course), h('th', {}, L.auxiliary), h('td', {}, r.auxiliary)),
      ),
    ),
    h(
      'table',
      { class: 'sheet-table quarter-grades' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          [L.number, L.criteria, L.level, L.notes].map((t) => h('th', {}, t)),
        ),
      ),
      h(
        'tbody',
        {},
        r.rows.map((row, i) =>
          h(
            'tr',
            {},
            h('td', { class: 'c' }, String(i + 1)),
            h('td', {}, row.criterion),
            h(
              'td',
              { class: 'c quarter-levels' },
              r.levels.map((g) => h('span', { class: g === row.grade ? 'circled' : '' }, g)),
            ),
            h('td', {}, row.note),
          ),
        ),
      ),
    ),
  );
}

/** Review and download the quarter strips of the chosen classes (one PDF, three students per page). */
export function quarterExportView(startClass?: string): View {
  const root = h('div', { class: 'screen' });
  let previewClass: string | null = startClass ?? null;
  let previewStudent = 0;
  let busy = false;

  async function run(button: HTMLButtonElement, status: HTMLElement): Promise<void> {
    const { classes, settings } = getData();
    const selected = includedClasses(classes);
    if (selected.length === 0) return notice(T.chooseClassesFirst, 'error');
    const sheets = selected.flatMap((c) =>
      quarterStudents(c.students, settings).map((s) => buildQuarterSheet(c, s, settings)),
    );
    if (sheets.length === 0) return notice(T.quarterNothingToExport, 'error');
    if (busy) return;
    busy = true;
    button.disabled = true;
    status.textContent = T.generating;
    try {
      const { buildQuarterPdf } = await import('../export/build-pdf');
      download(buildQuarterPdf(sheets), `${baseFileName(T.quarterPrefix, selected, settings.term)}.pdf`, MIME_PDF);
      notice(T.downloadReady, 'ok');
    } catch (err) {
      console.error(err);
      notice(T.generalError, 'error');
    } finally {
      status.textContent = '';
      button.disabled = false;
      busy = false;
    }
  }

  /** Students left out (no grade at all) and students with a missing grade, per class. */
  function warning(selected: SchoolClass[]): HTMLElement {
    const { settings } = getData();
    const lines = selected.flatMap((c) => {
      const printed = quarterStudents(c.students, settings);
      const skipped = c.students.filter((s) => !printed.includes(s));
      const partial = printed.filter((s) => !isQuarterComplete(s, settings));
      if (skipped.length === 0 && partial.length === 0) return [];
      const names = (list: typeof c.students) => list.map((s) => s.name).join('; ');
      return [
        h(
          'li',
          {},
          h(
            'span',
            {},
            h('strong', {}, c.label),
            skipped.length > 0 ? h('span', {}, ` — ${T.quarterSkipped(skipped.length)}: ${names(skipped)}`) : null,
            partial.length > 0 ? h('span', {}, ` — ${T.quarterPartial(partial.length)}: ${names(partial)}`) : null,
          ),
          h(
            'button',
            { class: 'btn btn-primary', type: 'button', onclick: () => goTo(quarterEntryRoute(c.id)) },
            T.quarterComplete(c.label),
          ),
        ),
      ];
    });
    return lines.length === 0
      ? h('div', { class: 'success-banner' }, `✓ ${T.quarterAllComplete}`)
      : h(
          'div',
          { class: 'warning-banner' },
          h('strong', {}, T.consolidatedPending),
          h('ul', { class: 'pending-list' }, lines),
          h('p', { class: 'muted' }, T.exportAnyway),
        );
  }

  function render(): void {
    const scroll = window.scrollY;
    clearChildren(root);
    const { classes, settings } = getData();
    root.append(
      stepsBanner(3),
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo(QUARTER_GUIDE) }, T.backToQuarter),
      h('h1', {}, T.quarterExportTitle),
      h(
        'p',
        { class: settings.quarterMonths.length > 0 ? 'muted' : 'missing' },
        settings.quarterMonths.length > 0
          ? T.quarterMonthsList(settings.quarterMonths.map(monthName).join(', '))
          : T.quarterChooseMonths,
        ' ',
        h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo(QUARTER_GUIDE) }, T.quarterChange),
      ),
    );
    if (settings.auxiliary.trim() === '')
      root.append(
        h(
          'div',
          { class: 'warning-banner' },
          h('span', {}, T.quarterNoAuxiliary, ' '),
          h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/settings') }, T.settings),
        ),
      );
    if (classes.length === 0) {
      root.append(h('p', {}, T.chooseClassesFirst), finishPanel());
      return;
    }
    root.append(
      h('h2', {}, T.chooseClasses),
      h(
        'div',
        { class: 'class-chips' },
        classes.map((c) => {
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
    const selected = includedClasses(classes);
    if (selected.length === 0) {
      root.append(h('p', { class: 'muted' }, T.chooseClassesFirst), finishPanel());
      return;
    }
    const status = h('p', { class: 'status', role: 'status' });
    const button: HTMLButtonElement = h(
      'button',
      { class: 'btn btn-primary btn-big', type: 'button', onclick: () => void run(button, status) },
      T.downloadPdf,
    );
    root.append(
      warning(selected),
      h('p', { class: 'muted' }, T.quarterPdfHelp),
      h('div', { class: 'actions' }, button),
      status,
    );

    if (!previewClass || !selected.some((c) => c.id === previewClass)) previewClass = selected[0].id;
    const c = selected.find((x) => x.id === previewClass)!;
    if (previewStudent >= c.students.length) previewStudent = 0;
    root.append(
      h('h2', {}, T.previewTitle),
      tabList(
        T.chooseClass,
        selected.map((x) => ({ key: x.id, text: x.label })),
        c.id,
        (key) => {
          previewClass = key;
          previewStudent = 0;
          render();
        },
      ),
    );
    if (c.students.length > 0) {
      const select = h(
        'select',
        { class: 'field', 'aria-label': T.student },
        c.students.map((s, i) => h('option', { value: i, selected: i === previewStudent }, `${i + 1}. ${s.name}`)),
      );
      select.addEventListener('change', () => {
        previewStudent = Number(select.value);
        render();
      });
      root.append(
        select,
        h('div', { class: 'sheet-frame' }, quarterStrip(buildQuarterSheet(c, c.students[previewStudent], settings))),
      );
    }
    root.append(finishPanel());
    window.scrollTo(0, scroll);
  }

  render();
  return { el: root };
}
