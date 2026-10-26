import { h, clearChildren, notice, download, filePicker, optionRow, MIME_PDF, confirmDialog } from '../ui/dom';
import { T } from '../ui/texts';
import { createBackup, backupWouldBeEmpty, readBackup, getData, restoreBackup, subscribe } from '../storage/store';
import { progress } from '../domain/model';
import { onLogosChange } from '../storage/logos';
import { baseFileName } from '../domain/report-layout';
import { buildQuarterSheet } from '../domain/quarter-layout';
import { monthName } from '../domain/attendance';
import { includedClasses, goTo, type View } from './view';
import { savingBanner } from './saving-banner';
import { chooseMonthAndDays } from './month-days';
import { confirmStartOver } from './start-over';

function backupBlock(): HTMLElement {
  return h(
    'section',
    { class: 'section' },
    h('h2', {}, T.backupTitle),
    h('p', { class: 'muted' }, T.backupHelp),
    optionRow(
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            // While stored data is locked the app holds placeholder data: a backup of it would look real but be empty
            if (backupWouldBeEmpty()) return notice(T.storedDataUnreadable, 'error');
            download(
              createBackup(),
              `${T.backupPrefix} ${new Date().toISOString().slice(0, 10)}.json`,
              'application/json',
            );
          },
        },
        T.downloadBackup,
      ),
      T.optionDownloadBackupHelp,
    ),
    optionRow(
      filePicker(
        T.restoreBackupButton,
        '.json,application/json',
        async (f) => {
          const backupFile = readBackup(await f.text());
          if (!backupFile) return notice(T.backupInvalid, 'error');
          if (await confirmDialog(T.restoreTitle, T.restoreText, T.yes, true)) {
            await restoreBackup(backupFile);
            notice(T.restored, 'ok');
          }
        },
        'btn',
      ),
      T.optionRestoreBackupHelp,
    ),
    optionRow(
      h(
        'button',
        {
          class: 'btn btn-danger-soft',
          type: 'button',
          onclick: () => void confirmStartOver(),
        },
        T.resetAll,
      ),
      T.resetHelp,
    ),
  );
}

/** Home: a simple menu. The 3-step flow lives on its own screen (#/steps). */
export function homeView(): View {
  const root = h('div', { class: 'screen' });

  const render = (): void => {
    clearChildren(root);
    const { classes } = getData();
    const hasClasses = classes.length > 0;
    const totals = classes.reduce(
      (acc, c) => {
        const p = progress(c);
        return { done: acc.done + p.doneCount, total: acc.total + p.total };
      },
      { done: 0, total: 0 },
    );
    const banner = savingBanner();
    if (banner) root.append(banner);

    root.append(
      h('h1', {}, T.app),
      h('p', { class: 'muted' }, T.homeIntro),
      h(
        'section',
        { class: 'hub-card' },
        h('h2', {}, T.registerTitle),
        h('p', {}, T.registerHelp),
        h(
          'p',
          { class: 'muted' },
          hasClasses ? T.homeSummary(classes.length, totals.done, totals.total) : T.homeNoClasses,
        ),
        h(
          'button',
          { class: 'btn btn-primary btn-big', type: 'button', onclick: () => goTo('#/steps') },
          hasClasses ? T.registerContinue : T.registerStart,
        ),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', {}, T.moreOptions),
        optionRow(
          h(
            'button',
            { class: 'btn', type: 'button', disabled: !hasClasses, onclick: () => void printBlankSheet() },
            T.printBlank,
          ),
          hasClasses ? T.blankSheetHelp : `${T.blankSheetHelp} ${T.optionNeedsClass}`,
        ),
        optionRow(
          h(
            'button',
            { class: 'btn', type: 'button', disabled: !hasClasses, onclick: () => void printBlankAttendance() },
            T.printBlankAttendance,
          ),
          hasClasses ? T.blankAttendanceHelp : `${T.blankAttendanceHelp} ${T.optionNeedsClass}`,
        ),
        optionRow(
          h(
            'button',
            { class: 'btn', type: 'button', disabled: !hasClasses, onclick: () => void printBlankQuarter() },
            T.printBlankQuarter,
          ),
          hasClasses ? T.blankQuarterHelp : `${T.blankQuarterHelp} ${T.optionNeedsClass}`,
        ),
        optionRow(
          h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/settings') }, T.settings),
          T.optionSettingsHelp,
        ),
        optionRow(
          h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/cleanup') }, T.cleanup),
          T.optionCleanupHelp,
        ),
      ),
      backupBlock(),
      h('p', { class: 'muted footer-note' }, T.autosaved),
    );
  };

  async function printBlankSheet(): Promise<void> {
    const selected = includedClasses(getData().classes);
    if (selected.length === 0) return notice(T.chooseClassesFirst, 'error');
    const { buildPdf } = await import('../export/build-pdf');
    const pdf = buildPdf(selected, getData().settings, true);
    download(pdf, `${baseFileName(T.blankPrefix, selected, getData().settings.term)}.pdf`, MIME_PDF);
    notice(T.downloadReady, 'ok');
  }

  /** Blank monthly sheets: the month and its school days are chosen now; the classes need no attendance data. */
  async function printBlankAttendance(): Promise<void> {
    const selected = includedClasses(getData().classes);
    if (selected.length === 0) return notice(T.chooseClassesFirst, 'error');
    const chosen = await chooseMonthAndDays();
    if (!chosen) return;
    const { buildAttendancePdf } = await import('../export/build-pdf');
    const withMonth = selected.map((c) => ({ ...c, attendanceMonths: [{ month: chosen.month, days: chosen.days }] }));
    const pdf = buildAttendancePdf(withMonth, chosen.month, getData().settings, true);
    download(pdf, `${baseFileName(T.blankAttendancePrefix, selected, monthName(chosen.month))}.pdf`, MIME_PDF);
    notice(T.downloadReady, 'ok');
  }

  /** Blank quarter strips: name, class and auxiliary filled in, no grade circled and no observations. */
  async function printBlankQuarter(): Promise<void> {
    const { classes, settings } = getData();
    const selected = includedClasses(classes);
    if (selected.length === 0) return notice(T.chooseClassesFirst, 'error');
    const { buildQuarterPdf } = await import('../export/build-pdf');
    const sheets = selected.flatMap((c) => c.students.map((s) => buildQuarterSheet(c, s, settings, true)));
    download(buildQuarterPdf(sheets), `${baseFileName(T.blankQuarterPrefix, selected, settings.term)}.pdf`, MIME_PDF);
    notice(T.downloadReady, 'ok');
  }

  render();
  const unsubscribe = subscribe(render);
  const unsubscribeLogos = onLogosChange(render);
  return {
    el: root,
    destroy: () => {
      unsubscribe();
      unsubscribeLogos();
    },
  };
}
