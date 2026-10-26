import { h, clearChildren, notice, download, tabList, MIME_DOCX, MIME_PDF, MIME_ZIP } from '../ui/dom';
import { T } from '../ui/texts';
import { stepsBanner } from '../ui/steps';
import { getData } from '../storage/store';
import { findMonth, monthName } from '../domain/attendance';
import { gradedCount, studentsMissingGender } from '../domain/norms';
import {
  buildNormsReport,
  CRITERIA_HEADER,
  HOLIDAY_LABEL,
  NORMS_HEADER_LABELS,
  type NormsReport,
} from '../domain/norms-layout';
import type { NormsFormat, NormsGrouping } from '../export/norms-files';
import { finishPanel } from './export-report';
import { goTo, isIncluded, type View } from './view';

/** On-screen preview of one student's report: same weeks, paragraphs and FERIADO cells as the files. */
function normsSheet(r: NormsReport): HTMLElement {
  const L = NORMS_HEADER_LABELS;
  return h(
    'div',
    { class: 'sheet norms-sheet' },
    h('div', { class: 'sheet-title' }, r.title),
    h('p', {}, `${L.name}: ${r.name}   ${L.course}: ${r.course}   `, h('strong', {}, `${L.month}: ${r.month}`)),
    h('p', {}, `${L.tutor}: ${r.tutor}`),
    r.weeks.map((week) =>
      h(
        'table',
        { class: 'sheet-table norms-week' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', {}, CRITERIA_HEADER),
            week.map((d) => h('th', {}, d.header)),
          ),
        ),
        h(
          'tbody',
          {},
          r.criteria.map((name, i) =>
            h(
              'tr',
              {},
              h('th', {}, name),
              week.flatMap((d) =>
                d.holiday
                  ? i === 0
                    ? [h('td', { class: 'holiday', rowspan: r.criteria.length }, HOLIDAY_LABEL)]
                    : []
                  : [h('td', {}, d.texts[i])],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/** Review and download the monthly norms reports of one class and month. */
export function normsExportView(startClass?: string, startMonth?: string): View {
  const root = h('div', { class: 'screen' });
  // Opens on the class and month she was just entering when she comes from the entry screen
  let classId: string | null = startClass ?? null;
  let month: string | null = startMonth ?? null;
  let format: NormsFormat = 'docx';
  let grouping: NormsGrouping = 'single';
  let previewStudent = 0;
  let busy = false;

  async function run(buttons: HTMLButtonElement[], status: HTMLElement): Promise<void> {
    const { classes, settings } = getData();
    const c = classes.find((x) => x.id === classId);
    const am = c && month ? findMonth(c, month) : undefined;
    if (!c || !am || busy) return;
    const students = c.students.filter((s) => gradedCount(s, am.month) > 0);
    if (students.length === 0) return notice(T.normsNothingToExport, 'error');
    if (studentsMissingGender(c, am.month).length > 0)
      return notice(T.genderMissingExport(studentsMissingGender(c, am.month).length), 'error');
    busy = true;
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = T.generating;
    try {
      const { buildNormsDownload } = await import('../export/norms-files');
      const file = buildNormsDownload(c, am, settings, students, format, grouping);
      download(file.bytes, file.name, grouping === 'zip' ? MIME_ZIP : format === 'docx' ? MIME_DOCX : MIME_PDF);
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

  /** Buttons that behave like radio options. */
  function choice<V extends string>(label: string, options: [V, string][], value: V, set: (v: V) => void) {
    return h(
      'div',
      { class: 'toggle', role: 'group', 'aria-label': label },
      options.map(([v, text]) =>
        h(
          'button',
          {
            class: `btn ${v === value ? 'active' : ''}`,
            type: 'button',
            'aria-pressed': String(v === value),
            onclick: () => {
              set(v);
              render();
            },
          },
          text,
        ),
      ),
    );
  }

  /** Tabs that also send the preview back to the first student. */
  const tabs = (label: string, items: { key: string; text: string }[], active: string, pick: (key: string) => void) =>
    tabList(label, items, active, (key) => {
      pick(key);
      previewStudent = 0;
      render();
    });

  function render(): void {
    const scroll = window.scrollY; // keep her place when picking a student far down the page
    clearChildren(root);
    const { classes, settings } = getData();
    root.append(
      stepsBanner(3),
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/norms') }, T.backToNorms),
      h('h1', {}, T.exportNormsTitle),
    );
    const withMonths = classes.filter((c) => c.attendanceMonths.length > 0 && isIncluded(c.id));
    if (withMonths.length === 0) {
      root.append(
        h('p', {}, classes.some((c) => c.attendanceMonths.length > 0) ? T.chooseClassesFirst : T.noMonthsYetNorms),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => goTo('#/norms') }, T.backToNorms),
      );
      return;
    }
    if (!withMonths.some((c) => c.id === classId)) {
      classId = withMonths[0].id;
      month = null;
    }
    const c = withMonths.find((x) => x.id === classId)!;
    if (!month || !findMonth(c, month)) month = c.attendanceMonths[c.attendanceMonths.length - 1].month;
    const am = findMonth(c, month)!;

    root.append(
      h('h2', {}, T.chooseClass),
      tabs(
        T.chooseClass,
        withMonths.map((x) => ({ key: x.id, text: x.label })),
        c.id,
        (key) => {
          classId = key;
          month = null;
        },
      ),
      h('h2', {}, T.chooseMonth),
      tabs(
        T.chooseMonth,
        c.attendanceMonths.map((m) => ({ key: m.month, text: monthName(m.month) })),
        am.month,
        (key) => (month = key),
      ),
    );

    // What is missing
    const total = settings.normsCriteria.length * am.days.length;
    const ungraded = c.students.filter((s) => gradedCount(s, am.month) === 0);
    const partial = c.students.filter((s) => {
      const n = gradedCount(s, am.month);
      return n > 0 && n < total;
    });
    const names = (list: typeof c.students) => `: ${list.map((s) => s.name).join('; ')}`;
    root.append(
      ungraded.length === 0 && partial.length === 0
        ? h('div', { class: 'success-banner' }, `✓ ${T.allCompleteNorms}`)
        : h(
            'div',
            { class: 'warning-banner' },
            ungraded.length > 0 ? h('p', {}, h('strong', {}, T.normsSkipped(ungraded.length)), names(ungraded)) : null,
            partial.length > 0 ? h('p', {}, h('strong', {}, T.normsPartial(partial.length)), names(partial)) : null,
            h('p', { class: 'muted' }, T.exportAnyway),
          ),
    );

    // Gender decides the wording of each paragraph, so nothing is downloaded until it is chosen
    const noGender = studentsMissingGender(c, am.month);
    if (noGender.length > 0) {
      root.append(
        h(
          'div',
          { class: 'warning-banner', role: 'alert' },
          h('p', {}, h('strong', {}, T.genderMissingExport(noGender.length)), names(noGender)),
          h(
            'button',
            { class: 'btn btn-primary', type: 'button', onclick: () => goTo(`#/class/${c.id}/details`) },
            T.chooseGender,
          ),
        ),
      );
    }

    // Options and download
    const status = h('p', { class: 'status', role: 'status' });
    const all: HTMLButtonElement[] = [];
    const downloadButton = h(
      'button',
      {
        class: 'btn btn-primary btn-big',
        type: 'button',
        disabled: noGender.length > 0,
        onclick: () => void run(all, status),
      },
      T.downloadNorms,
    );
    all.push(downloadButton);
    root.append(
      h('h2', {}, T.fileFormat),
      choice<NormsFormat>(
        T.fileFormat,
        [
          ['docx', T.formatWord],
          ['pdf', T.formatPdf],
        ],
        format,
        (v) => (format = v),
      ),
      h('h2', {}, T.fileGrouping),
      choice<NormsGrouping>(
        T.fileGrouping,
        [
          ['single', T.groupingSingle],
          ['zip', T.groupingZip],
        ],
        grouping,
        (v) => (grouping = v),
      ),
      h('p', { class: 'muted' }, grouping === 'single' ? T.groupingSingleHelp : T.groupingZipHelp),
      h('div', { class: 'actions' }, downloadButton),
      status,
    );

    // Preview of one student
    if (previewStudent >= c.students.length) previewStudent = 0;
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
        h('h2', {}, T.previewTitle),
        select,
        h('div', { class: 'sheet-frame' }, normsSheet(buildNormsReport(c, c.students[previewStudent], settings, am))),
      );
    }
    root.append(finishPanel());
    window.scrollTo(0, scroll);
  }

  render();
  return { el: root };
}
