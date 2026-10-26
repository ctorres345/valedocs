import { h, clearChildren, notice, download, MIME_PDF, MIME_XLSX, optionRow, tabList } from '../ui/dom';
import { T } from '../ui/texts';
import { stepsBanner } from '../ui/steps';
import { getData } from '../storage/store';
import {
  buildReport,
  NAME_HEADER,
  NUMBER_HEADER,
  columnHeader,
  incompleteRows,
  baseFileName,
  type Report,
} from '../domain/report-layout';
import { driveAvailable, DriveError, preloadGoogle, uploadToDrive } from '../export/drive';
import {
  OBSERVATIONS_HEADER,
  WORKSHOP_HEADER,
  buildAttendanceReport,
  incompleteAttendanceRows,
  type AttendanceReport,
} from '../domain/attendance-layout';
import { classesWithMonth, findMonth, monthName, studentsMissingWorkshop } from '../domain/attendance';
import type { SchoolClass, Student } from '../domain/model';
import { getLogos } from '../storage/logos';
import { confirmStartOver } from './start-over';
import { isIncluded, includedClasses, include, goTo, type ReportKind, type View } from './view';

/** End of the flow: she can always get back home or start over. */
export function finishPanel(): HTMLElement {
  return h(
    'section',
    { class: 'section' },
    h('h2', {}, T.finishedTitle),
    h('p', { class: 'muted' }, T.finishedHelp),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => goTo('#/') }, T.backHomeButton),
    ),
    optionRow(
      h(
        'button',
        {
          class: 'btn btn-danger-soft',
          type: 'button',
          onclick: async () => {
            if (await confirmStartOver()) goTo('#/steps');
          },
        },
        T.startOver,
      ),
      T.startOverHelp,
    ),
  );
}

/** Logos and institution name at the top of a preview sheet. */
export function sheetHeader(r: { institution1: string; institution2: string }): HTMLElement {
  const logos = getLogos();
  return h(
    'div',
    { class: 'sheet-header' },
    logos.left ? h('img', { src: logos.left.uri, alt: '', class: 'sheet-logo-left' }) : h('span', {}),
    h('div', { class: 'sheet-institution' }, h('div', {}, r.institution1), h('div', {}, r.institution2)),
    logos.right ? h('img', { src: logos.right.uri, alt: '', class: 'sheet-logo-right' }) : h('span', {}),
  );
}

function sheet(r: Report): HTMLElement {
  const n = r.columns.length;
  const head = h(
    'tr',
    {},
    h('th', {}, NUMBER_HEADER),
    h('th', {}, NAME_HEADER),
    r.columns.map((c) => h('th', {}, columnHeader(c))),
  );
  return h(
    'div',
    { class: 'sheet' },
    sheetHeader(r),
    h('div', { class: 'sheet-title' }, r.title1),
    r.title2.trim() ? h('div', { class: 'sheet-title' }, r.title2) : null,
    h('div', { class: 'sheet-term' }, r.term),
    h('div', { class: 'sheet-class' }, h('span', {}, r.label), h('span', {}, r.tutor)),
    h(
      'table',
      { class: 'sheet-table' },
      h('thead', {}, head),
      h(
        'tbody',
        {},
        r.rows.map((f) =>
          h(
            'tr',
            { class: f.note === '' && f.grades.some((x) => x === '') ? 'incomplete' : '' },
            h('td', { class: 'c' }, String(f.position)),
            h('td', { class: 'name' }, f.name),
            f.note !== ''
              ? h('td', { class: 'c note', colspan: n }, f.note)
              : f.grades.map((x) => h('td', { class: 'c' }, x)),
          ),
        ),
      ),
    ),
  );
}

/** On-screen preview of the attendance report. */
function attendanceSheet(r: AttendanceReport): HTMLElement {
  const d = r.days.length;
  return h(
    'div',
    { class: 'sheet sheet-attendance' },
    sheetHeader(r),
    h('div', { class: 'sheet-term' }, r.term),
    h('div', { class: 'sheet-class' }, h('span', {}, r.label), h('span', {}, r.title), h('span', {}, r.tutor)),
    r.uniformNote !== '' ? h('div', { class: 'sheet-uniform' }, r.uniformNote) : null,
    h(
      'table',
      { class: 'sheet-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', {}, NUMBER_HEADER),
          h('th', {}, WORKSHOP_HEADER),
          h('th', {}, NAME_HEADER),
          r.days.map((day) => h('th', { class: 'day' }, String(day))),
          h('th', {}, OBSERVATIONS_HEADER),
        ),
      ),
      h(
        'tbody',
        {},
        r.rows.map((f) =>
          h(
            'tr',
            { class: f.note === '' && f.marks.some((m) => m === '') ? 'incomplete' : '' },
            h('td', { class: 'c' }, String(f.position)),
            h('td', { class: 'c' }, f.workshop),
            h('td', { class: 'name' }, f.name),
            f.note !== ''
              ? h('td', { class: 'c note', colspan: d + 1 }, f.note)
              : [...f.marks.map((m) => h('td', { class: 'c day' }, m)), h('td', { class: 'c' }, f.summary)],
          ),
        ),
      ),
    ),
  );
}

/** Months opened in at least one class, oldest first. */
export function monthsOf(classes: SchoolClass[]): string[] {
  return [...new Set(classes.flatMap((c) => c.attendanceMonths.map((m) => m.month)))].sort();
}

export function exportView(kind: Exclude<ReportKind, 'norms'> = 'conduct', startMonth?: string): View {
  const root = h('div', { class: 'screen' });
  let busy = false;
  let previewClass: string | null = null;
  // Attendance opens on the month she was just entering
  let month: string | null = startMonth ?? null;
  const backRoute = kind === 'conduct' ? '#/conduct' : '#/attendance';

  /** Classes the report can include: for attendance only those that have the chosen month. */
  function eligible(classes: SchoolClass[]): SchoolClass[] {
    return kind === 'conduct' || !month ? classes : classesWithMonth(classes, month).map((x) => x.schoolClass);
  }
  preloadGoogle();

  /** Selected classes with students who still need a workshop (attendance only; it is printed in every row). */
  function missingWorkshops(selected: SchoolClass[]): { c: SchoolClass; s: Student[] }[] {
    if (kind !== 'attendance') return [];
    return selected
      .map((c) => {
        const am = findMonth(c, month ?? '');
        return { c, s: am ? studentsMissingWorkshop(c, am) : [] };
      })
      .filter((x) => x.s.length > 0);
  }

  async function run(
    action: 'xlsx' | 'pdf' | 'drive',
    buttons: HTMLButtonElement[],
    status: HTMLElement,
  ): Promise<void> {
    const selected = includedClasses(eligible(getData().classes));
    if (selected.length === 0) return notice(T.chooseClassesFirst, 'error');
    const noWorkshop = missingWorkshops(selected);
    if (noWorkshop.length > 0) {
      return notice(T.workshopMissingExport(noWorkshop.reduce((n, x) => n + x.s.length, 0)), 'error');
    }
    if (busy) return;
    busy = true;
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = action === 'drive' ? T.driveUploading : T.generating;
    try {
      const { settings } = getData();
      const base =
        kind === 'conduct'
          ? baseFileName(T.reportPrefix, selected, settings.term)
          : baseFileName(T.attendancePrefix, selected, monthName(month ?? ''));
      if (action === 'pdf') {
        const pdf = await import('../export/build-pdf');
        download(
          kind === 'conduct'
            ? pdf.buildPdf(selected, settings)
            : pdf.buildAttendancePdf(selected, month ?? '', settings),
          `${base}.pdf`,
          MIME_PDF,
        );
        notice(T.downloadReady, 'ok');
      } else {
        const xlsx = await import('../export/build-xlsx');
        const bytes =
          kind === 'conduct'
            ? await xlsx.buildWorkbook(selected, settings)
            : await xlsx.buildAttendanceWorkbook(selected, month ?? '', settings);
        if (action === 'xlsx') {
          download(bytes, `${base}.xlsx`, MIME_XLSX);
          notice(T.downloadReady, 'ok');
        } else {
          const link = await uploadToDrive(bytes, base);
          window.open(link, '_blank', 'noopener');
          notice(T.driveDone, 'ok');
        }
      }
    } catch (err) {
      console.error(err);
      notice(err instanceof DriveError ? err.message : T.generalError, 'error');
    } finally {
      status.textContent = '';
      buttons.forEach((b) => (b.disabled = false));
      busy = false;
    }
  }

  function previewSheet(c: SchoolClass, settings: ReturnType<typeof getData>['settings']): HTMLElement {
    return kind === 'conduct'
      ? sheet(buildReport(c, settings, false))
      : attendanceSheet(buildAttendanceReport(c, settings, findMonth(c, month ?? '')!, false));
  }

  function render(): void {
    const scroll = window.scrollY; // keep her place when clicking a tab far down the page
    clearChildren(root);
    const { classes, settings } = getData();
    root.append(
      stepsBanner(3),
      h(
        'button',
        { class: 'btn btn-text', type: 'button', onclick: () => goTo(backRoute) },
        kind === 'conduct' ? T.backToConduct : T.backToAttendance,
      ),
      h('h1', {}, kind === 'conduct' ? T.exportTitle : T.exportAttendanceTitle),
    );
    if (classes.length === 0) {
      root.append(h('p', {}, T.noClassesText), finishPanel());
      return;
    }

    // Month selection (attendance only)
    if (kind === 'attendance') {
      const months = monthsOf(classes);
      if (months.length === 0) {
        root.append(
          h('p', {}, T.noMonthsYet),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => goTo(backRoute) }, T.backToAttendance),
        );
        return;
      }
      if (!month || !months.includes(month)) month = months[months.length - 1];
      root.append(
        h('h2', {}, T.chooseMonth),
        tabList(
          T.chooseMonth,
          months.map((m) => ({ key: m, text: monthName(m) })),
          month,
          (m) => {
            month = m;
            render();
          },
        ),
      );
    }

    // Class selection
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
      root.append(h('p', { class: 'muted' }, T.chooseClassesFirst));
      return;
    }

    // Missing-grades warnings
    const missing = selected
      .map((c) => ({
        c,
        f:
          kind === 'conduct'
            ? incompleteRows(buildReport(c, settings, false))
            : incompleteAttendanceRows(buildAttendanceReport(c, settings, findMonth(c, month ?? '')!, false)),
      }))
      .filter((x) => x.f.length > 0);
    root.append(
      missing.length === 0
        ? h('div', { class: 'success-banner' }, `✓ ${T.allComplete}`)
        : h(
            'div',
            { class: 'warning-banner' },
            h('strong', {}, T.missingGrades),
            h(
              'ul',
              {},
              missing.map(({ c, f }) =>
                h(
                  'li',
                  {},
                  T.missingFor(c.label, f.length),
                  h(
                    'span',
                    { class: 'muted' },
                    `: ${f
                      .slice(0, 4)
                      .map((x) => x.name)
                      .join('; ')}${f.length > 4 ? '…' : ''}`,
                  ),
                ),
              ),
            ),
            h('p', { class: 'muted' }, T.exportAnyway),
          ),
    );

    // Nothing is downloaded until each student has a workshop
    const noWorkshop = missingWorkshops(selected);
    const blocked = noWorkshop.length > 0;
    if (blocked) {
      root.append(
        h(
          'div',
          { class: 'warning-banner', role: 'alert' },
          noWorkshop.map(({ c, s }) =>
            h(
              'p',
              {},
              h('strong', {}, `${c.label}: ${T.workshopMissingExport(s.length)}`),
              h(
                'span',
                { class: 'muted' },
                ` ${s
                  .slice(0, 4)
                  .map((x) => x.name)
                  .join('; ')}${s.length > 4 ? '…' : ''}`,
              ),
              ' ',
              h(
                'button',
                { class: 'btn btn-primary', type: 'button', onclick: () => goTo(`#/class/${c.id}/details`) },
                T.chooseWorkshop,
              ),
            ),
          ),
        ),
      );
    }

    // Buttons
    const status = h('p', { class: 'status', role: 'status' });
    const excelButton = h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        disabled: blocked,
        onclick: () => void run('xlsx', all, status),
      },
      T.downloadExcel,
    );
    const pdfButton = h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        disabled: blocked,
        onclick: () => void run('pdf', all, status),
      },
      T.downloadPdf,
    );
    const all: HTMLButtonElement[] = [excelButton, pdfButton];
    const actions = h('div', { class: 'actions' }, excelButton, pdfButton);
    if (driveAvailable()) {
      const driveButton = h(
        'button',
        {
          class: 'btn',
          type: 'button',
          disabled: blocked,
          onclick: () => void run('drive', all, status),
        },
        T.saveToDrive,
      );
      all.push(driveButton);
      actions.append(driveButton);
    }
    root.append(actions, status);

    // Preview
    if (!previewClass || !selected.some((c) => c.id === previewClass)) previewClass = selected[0].id;
    root.append(
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
        previewSheet(
          selected.find((c) => c.id === previewClass)!,
          settings,
        ),
      ),
      finishPanel(),
    );
    window.scrollTo(0, scroll);
  }

  render();
  return { el: root };
}
