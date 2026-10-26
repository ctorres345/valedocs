import {
  h,
  clearChildren,
  notice,
  confirmDialog,
  dialog,
  filePicker,
  fileDropZone,
  optionRow,
  progressBar,
} from '../ui/dom';
import { T } from '../ui/texts';
import { change, mergeStudents, getData, removeClassById, subscribe } from '../storage/store';
import { formatTutor, parseTutor, sameClass, newStudent, newClass, progress, type SchoolClass } from '../domain/model';
import { isClassAttendanceComplete } from '../domain/attendance';
import { isClassNormsComplete } from '../domain/norms';
import { duplicateNames } from '../domain/validation';
import { readList, errorMessage } from '../import/worker-client';
import type { ImportedClass } from '../import/read-names';
import { monthsWarning } from './months-warning';
import { isIncluded, include, goTo, type ReportKind, type View } from './view';
import { savingBanner } from './saving-banner';

function applyImport(chosen: ImportedClass[]): number {
  change((d) => {
    const n = d.settings.columns.length;
    for (const imported of chosen) {
      const existing = d.classes.find((c) => sameClass(c.label, imported.label));
      if (existing)
        existing.students = mergeStudents(existing.students, imported.names, n, imported.genders, imported.workshops);
      else
        d.classes.push(
          newClass(
            imported.label,
            '',
            imported.names.map((name, i) => newStudent(name, n, imported.genders[i], imported.workshops[i])),
          ),
        );
    }
  });
  return chosen.length;
}

function importDialog(classes: ImportedClass[]): void {
  const existingList = getData().classes;
  // If the file has two sheets of the same class, only the first one can be chosen
  const duplicateInFile = classes.map((c, i) => classes.findIndex((o) => sameClass(o.label, c.label)) < i);
  const marks = classes.map((c, i) => !duplicateInFile[i] && !existingList.some((e) => sameClass(e.label, c.label)));
  const rows = classes.map((c, i) => {
    const alreadyExists = !duplicateInFile[i] && !marks[i];
    const duplicates = duplicateNames(c.names);
    const checkbox = h('input', {
      type: 'checkbox',
      id: `import-${i}`,
      class: 'checkbox',
      disabled: duplicateInFile[i],
    });
    checkbox.checked = marks[i];
    checkbox.addEventListener('change', () => (marks[i] = checkbox.checked));
    return h(
      'label',
      { class: 'import-row', for: `import-${i}` },
      checkbox,
      h(
        'span',
        { class: 'import-row-text' },
        h('strong', {}, c.label),
        h('span', { class: 'muted' }, ` · ${T.studentCount(c.names.length)}`),
        h('span', { class: 'names-preview muted' }, c.names.slice(0, 3).join(' · ') + (c.names.length > 3 ? ' …' : '')),
        alreadyExists ? h('span', { class: 'already-note' }, T.alreadyExists) : null,
        duplicateInFile[i] ? h('span', { class: 'already-note' }, T.classTwice) : null,
        duplicates.length > 0 ? h('span', { class: 'already-note' }, T.duplicatesInFile(duplicates)) : null,
      ),
    );
  });
  const content = h(
    'div',
    {},
    h('p', { class: 'muted' }, T.importInstruction),
    h('div', { class: 'import-list' }, rows),
  );
  dialog(
    { title: T.classesFound, content, accept: T.addSelected },
    () => {
      const chosen = classes.filter((_, i) => marks[i]);
      if (chosen.length === 0) {
        notice(T.noneSelected, 'error');
        return false;
      }
      notice(T.added(applyImport(chosen)), 'ok');
    },
    () => {},
  );
}

async function importFile(file: File, status: HTMLElement): Promise<void> {
  status.textContent = T.reading;
  try {
    const classes = await readList(file);
    status.textContent = '';
    if (classes.length === 0) return notice(T.noNames, 'error');
    importDialog(classes);
  } catch (err) {
    status.textContent = '';
    notice(err instanceof Error && err.message === 'LEGACY_XLS' ? T.legacyFormat : errorMessage(err), 'error');
  }
}

/** The tutor's name box, typed right on the card so it is not forgotten. */
function tutorBox(c: SchoolClass, onSaved: () => void): HTMLElement {
  // The tutor is typed here so it is not forgotten; it is saved when she leaves the field (without re-rendering,
  // so the next click is not lost) and can also be edited in the class details.
  const preview = h('p', { class: 'muted' });
  const showPreview = (text: string): void => {
    const name = parseTutor(text);
    preview.textContent = name === '' ? T.tutorMissingHint : T.tutorPreview(formatTutor({ tutor: name }));
    preview.classList.toggle('missing', name === '');
  };
  const tutorInput = h('input', {
    type: 'text',
    class: 'field',
    id: `tutor-${c.id}`,
    value: c.tutor,
    placeholder: T.tutorPlaceholder,
    autocomplete: 'off',
  });
  tutorInput.addEventListener('input', () => showPreview(tutorInput.value));
  tutorInput.addEventListener('change', () => {
    const name = parseTutor(tutorInput.value);
    tutorInput.value = name;
    change(() => (c.tutor = name), false);
    showPreview(name);
    onSaved();
  });
  showPreview(c.tutor);
  return h('div', { class: 'tutor-box' }, h('label', { for: `tutor-${c.id}` }, T.tutorOfClass), tutorInput, preview);
}

function includeBox(c: SchoolClass, onChange: () => void): HTMLElement {
  const checkbox = h('input', { type: 'checkbox', class: 'checkbox', id: `include-${c.id}` });
  checkbox.checked = isIncluded(c.id);
  checkbox.addEventListener('change', () => {
    include(c.id, checkbox.checked);
    onChange();
  });
  return h('label', { class: 'include-label', for: `include-${c.id}` }, checkbox, T.includeInSteps);
}

/** One class on the classes screen: only what belongs to the class itself (students, delete). */
function classCard(c: SchoolClass): HTMLElement {
  return h(
    'article',
    { class: 'card' },
    h('h3', {}, c.label),
    h('p', { class: 'muted' }, T.studentCount(c.students.length)),
    optionRow(
      h('button', { class: 'btn', type: 'button', onclick: () => goTo(`#/class/${c.id}/details`) }, T.classDetails),
      T.optionDetailsHelp,
    ),
    optionRow(
      h(
        'button',
        {
          class: 'btn btn-danger-soft',
          type: 'button',
          onclick: async () => {
            if (await confirmDialog(T.removeClassTitle, T.removeClassText(c.label), T.remove, true)) {
              removeClassById(c.id);
              notice(T.classRemoved, 'ok');
            }
          },
        },
        T.deleteClass,
      ),
      T.optionDeleteHelp,
    ),
  );
}

/** What differs between the reports in their 3-step guide and their class cards. */
interface ReportSpec {
  title: string;
  step2: string;
  step2Help: string;
  /** Screen where she enters the data of one class. */
  entryRoute: (classId: string) => string;
  entryHelp: string;
  exportRoute: string;
  isComplete: (c: SchoolClass) => boolean;
  /** Progress shown in a class card. */
  summary: (c: SchoolClass) => HTMLElement[];
  /** What is pending in step 3, if anything. */
  warning: (classes: SchoolClass[]) => HTMLElement | null;
  /** Another download offered in step 3, built from the same data. */
  extra?: { label: string; help: string; route: string };
}

const monthsSummary = (c: SchoolClass): HTMLElement[] => [
  h('p', { class: 'muted' }, T.monthsCount(c.attendanceMonths.length)),
];

const REPORTS: Record<ReportKind, ReportSpec> = {
  conduct: {
    title: T.conductReport,
    step2: T.step2,
    step2Help: T.step2Help,
    entryRoute: (id) => `#/class/${id}`,
    entryHelp: T.conductReportHelp,
    exportRoute: '#/export',
    isComplete: (c) => progress(c).doneCount === progress(c).total,
    summary: (c) => {
      const { doneCount, total } = progress(c);
      return [progressBar(doneCount, total), h('p', { class: 'muted' }, T.completed(doneCount, total))];
    },
    warning: () => null,
  },
  attendance: {
    title: T.attendanceReport,
    step2: T.step2Attendance,
    step2Help: T.step2AttendanceHelp,
    entryRoute: (id) => `#/class/${id}/attendance`,
    entryHelp: T.attendanceReportHelp,
    exportRoute: '#/export/attendance',
    isComplete: isClassAttendanceComplete,
    summary: monthsSummary,
    warning: (classes) => monthsWarning('attendance', classes),
    extra: { label: T.consolidatedButton, help: T.consolidatedButtonHelp, route: '#/export/consolidated' },
  },
  norms: {
    title: T.normsReport,
    step2: T.step2Norms,
    step2Help: T.step2NormsHelp,
    entryRoute: (id) => `#/class/${id}/norms`,
    entryHelp: T.normsReportHelp,
    exportRoute: '#/export/norms',
    isComplete: (c) => isClassNormsComplete(c, getData().settings),
    summary: monthsSummary,
    warning: (classes) => monthsWarning('norms', classes),
  },
};

/** One class in step 2 of a report: tutor, progress and the button that opens its entry screen. */
function reportCard(c: SchoolClass, spec: ReportSpec, onChange: () => void): HTMLElement {
  return h(
    'article',
    { class: 'card' },
    h('h3', {}, c.label),
    spec.summary(c),
    tutorBox(c, onChange),
    optionRow(
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => goTo(spec.entryRoute(c.id)) }, spec.title),
      spec.entryHelp,
    ),
    includeBox(c, onChange),
  );
}

/** A numbered guide step: circle with the number (or ✓ when done), title, help text and content. */
function step(n: number, title: string, help: string, done: boolean, ...content: (Node | null)[]): HTMLElement {
  return h(
    'li',
    { class: `step ${done ? 'step-done' : ''}` },
    h('div', { class: 'step-num', 'aria-hidden': 'true' }, done ? '✓' : String(n)),
    h(
      'div',
      { class: 'step-body' },
      h('h2', {}, `${T.step(n)}: ${title}`, done ? h('span', { class: 'done-label' }, ` · ${T.done}`) : null),
      h('p', { class: 'muted' }, help),
      ...content,
    ),
  );
}

/** Step 1 of the classes screen: import the list of students. */
function importStep(hasClasses: boolean, status: HTMLElement): HTMLElement {
  return step(
    1,
    T.step1,
    T.step1Help,
    hasClasses,
    hasClasses
      ? h(
          'div',
          { class: 'actions' },
          filePicker(T.importList, '.xlsx,.xls,.csv', (f) => void importFile(f, status)),
          h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/new') }, T.addByHand),
        )
      : fileDropZone('.xlsx,.xls,.csv', (f) => void importFile(f, status), T.importList, T.importHelp),
    hasClasses
      ? null
      : h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/new') }, T.addByHand),
        ),
    status,
  );
}

/** Classes screen: import the list, manage the classes, then choose which report to make. */
export function registerView(): View {
  const root = h('div', { class: 'screen' });
  const status = h('p', { class: 'status', role: 'status' });

  const render = (): void => {
    clearChildren(root);
    const { classes } = getData();
    const hasClasses = classes.length > 0;
    const banner = savingBanner();
    if (banner) root.append(banner);
    root.append(
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/') }, T.backHome),
      h('h1', {}, T.classesTitle),
      h('ol', { class: 'steps' }, importStep(hasClasses, status)),
    );
    if (!hasClasses) return;
    root.append(
      h('h2', {}, T.myClasses),
      h('div', { class: 'cards' }, classes.map(classCard)),
      h('h2', {}, T.chooseReport),
      h('p', { class: 'muted' }, T.chooseReportHelp),
      h(
        'div',
        { class: 'report-choice' },
        (['conduct', 'attendance', 'norms'] as const).map((kind) =>
          optionRow(
            h(
              'button',
              { class: 'btn btn-primary btn-big', type: 'button', onclick: () => goTo(`#/${kind}`) },
              REPORTS[kind].title,
            ),
            REPORTS[kind].entryHelp,
          ),
        ),
      ),
    );
  };

  render();
  const unsubscribe = subscribe(render);
  return { el: root, destroy: unsubscribe };
}

/** The 3-step guide of one report: classes are already imported, enter the data, review and download. */
export function reportView(kind: ReportKind): View {
  const root = h('div', { class: 'screen' });
  const spec = REPORTS[kind];
  // Changing a tutor or "include" does not re-render the screen (so the next click is not lost); the warning is refreshed alone
  const warningSlot = h('div');
  const refreshWarning = (): void => {
    clearChildren(warningSlot);
    const warning = spec.warning(getData().classes);
    if (warning) warningSlot.append(warning);
  };

  const render = (): void => {
    clearChildren(root);
    const { classes } = getData();
    const allComplete = classes.length > 0 && classes.every(spec.isComplete);
    refreshWarning();
    const banner = savingBanner();
    if (banner) root.append(banner);
    root.append(
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/steps') }, T.backToClasses),
      h('h1', {}, spec.title),
      h(
        'ol',
        { class: 'steps' },
        step(
          1,
          T.step1,
          T.classesImported(classes.length),
          true,
          h(
            'div',
            { class: 'actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/steps') }, T.changeClasses),
          ),
        ),
        step(
          2,
          spec.step2,
          spec.step2Help,
          allComplete,
          h(
            'div',
            { class: 'cards' },
            classes.map((c) => reportCard(c, spec, refreshWarning)),
          ),
        ),
        step(
          3,
          T.step3,
          T.step3Help,
          false,
          warningSlot,
          h(
            'div',
            { class: 'actions' },
            h(
              'button',
              { class: 'btn btn-primary', type: 'button', onclick: () => goTo(spec.exportRoute) },
              T.previewAndExport,
            ),
          ),
          spec.extra
            ? optionRow(
                h('button', { class: 'btn', type: 'button', onclick: () => goTo(spec.extra!.route) }, spec.extra.label),
                spec.extra.help,
              )
            : null,
        ),
      ),
    );
  };

  render();
  const unsubscribe = subscribe(render);
  return { el: root, destroy: unsubscribe };
}
