import { h, clearChildren, notice, confirmDialog } from '../ui/dom';
import { T } from '../ui/texts';
import { stepsBanner } from '../ui/steps';
import { findClass, change, getData, removeClassById } from '../storage/store';
import { cleanName, newStudent, parseTutor, workshopsFor, GENDERS, type Gender } from '../domain/model';
import { nameKey } from '../domain/text';
import { duplicateClass, duplicateName, duplicateNames } from '../domain/validation';
import { autosaveBanner } from './saving-banner';
import { goTo, type View } from './view';

/**
 * Editing a saved class. Every change is validated before being saved:
 * if the name is empty or duplicated, a notice is shown and the previous value is kept.
 */
export function classDetailsView(id: string): View {
  const root = h('div', { class: 'screen' });
  const schoolClass = findClass(id);
  if (!schoolClass) {
    root.append(
      h('p', {}, T.notFound),
      h('button', { class: 'btn', type: 'button', onclick: () => goTo('#/steps') }, T.backToClasses),
    );
    return { el: root };
  }
  const colCount = (): number => getData().settings.columns.length;
  const names = (): string[] => schoolClass.students.map((a) => a.name);
  const list = h('div', { class: 'student-list' });
  const duplicatesEl = h('div', { role: 'alert' });

  /** Adds new names skipping empty and duplicate ones (against the list or each other); returns how many were skipped. */
  function addNames(newNames: string[]): { addedCount: number; skipped: number } {
    const seen = new Set(names().map(nameKey));
    const accepted: string[] = [];
    let skipped = 0;
    for (const n of newNames.map(cleanName).filter((x) => x !== '')) {
      if (seen.has(nameKey(n))) skipped++;
      else {
        seen.add(nameKey(n));
        accepted.push(n);
      }
    }
    if (accepted.length > 0)
      change(() => schoolClass!.students.push(...accepted.map((n) => newStudent(n, colCount()))));
    return { addedCount: accepted.length, skipped };
  }

  const renderList = (): void => {
    clearChildren(list);
    clearChildren(duplicatesEl);
    const duplicates = duplicateNames(names());
    const keys = new Set(duplicates.map(nameKey));
    if (duplicates.length > 0)
      duplicatesEl.append(h('div', { class: 'warning-banner' }, T.listHasDuplicates(duplicates)));

    schoolClass.students.forEach((a, i) => {
      const name = h('input', {
        type: 'text',
        class: `field ${keys.has(nameKey(a.name)) ? 'field-error' : ''}`,
        value: a.name,
        'aria-label': `${T.studentName} ${i + 1}`,
      });
      // Saved when typing ends (Enter or leaving the field), not letter by letter
      name.addEventListener('change', () => {
        const next = cleanName(name.value);
        if (next === a.name) return void (name.value = next);
        if (next === '') {
          notice(T.errNameEmpty, 'error');
        } else if (duplicateName(names(), next, i)) {
          notice(T.errNameDuplicate(next), 'error');
        } else {
          change(() => (a.name = next));
          return renderList();
        }
        name.value = a.name;
      });
      const move = (delta: number): void => {
        const j = i + delta;
        if (j < 0 || j >= schoolClass.students.length) return;
        change(() => {
          const [x] = schoolClass.students.splice(i, 1);
          schoolClass.students.splice(j, 0, x);
        });
        renderList();
      };
      const button = (text: string, title: string, action: () => void, extra = ''): HTMLElement =>
        h(
          'button',
          {
            class: `btn btn-small ${extra}`,
            type: 'button',
            title: title,
            'aria-label': `${title} ${a.name}`,
            onclick: action,
          },
          text,
        );
      // Updated in place: rebuilding the list would send her back to the top of a 30-row screen
      const genderButtons = new Map<Gender, HTMLElement>();
      const showGender = (): void =>
        genderButtons.forEach((button, g) => {
          button.classList.toggle('active', a.gender === g);
          button.setAttribute('aria-pressed', String(a.gender === g));
        });
      const genderButton = (g: Gender): HTMLElement => {
        const button = h(
          'button',
          {
            class: 'btn btn-small',
            type: 'button',
            title: T.genderName[g],
            'aria-label': `${T.genderName[g]}: ${a.name}`,
            onclick: () => {
              // Tapping the chosen one again clears it
              change(() => (a.gender = a.gender === g ? '' : g), false);
              showGender();
            },
          },
          g,
        );
        genderButtons.set(g, button);
        return button;
      };
      // A code kept from before a class label change is still shown, so nothing is silently lost
      const codes = workshopsFor(schoolClass.label);
      if (a.workshop !== '' && !codes.includes(a.workshop)) codes.push(a.workshop);
      const workshop = h(
        'select',
        { class: 'field workshop-select', 'aria-label': `${T.workshop}: ${a.name}` },
        h('option', { value: '' }, T.workshopPlaceholder),
        codes.map((code) => h('option', { value: code }, T.workshopName[code] ?? code)),
      );
      workshop.value = a.workshop;
      workshop.addEventListener('change', () => change(() => (a.workshop = workshop.value), false));
      list.append(
        h(
          'div',
          { class: 'student-row' },
          h('span', { class: 'num' }, String(i + 1)),
          name,
          workshop,
          h('div', { class: 'toggle gender-toggle', role: 'group', 'aria-label': T.gender }, GENDERS.map(genderButton)),
          button('↑', T.moveUp, () => move(-1)),
          button('↓', T.moveDown, () => move(1)),
          button(
            `✕ ${T.removeStudent}`,
            T.removeStudent,
            () => {
              const [removed] = schoolClass.students.slice(i, i + 1);
              change(() => schoolClass.students.splice(i, 1));
              renderList();
              // One tap removes a student with all their grades, so offer to bring them back
              notice(T.studentRemoved(removed.name), 'info', {
                label: `↶ ${T.undo}`,
                run: () => {
                  change(() => schoolClass.students.splice(Math.min(i, schoolClass.students.length), 0, removed));
                  renderList();
                },
              });
            },
            'btn-danger-soft',
          ),
        ),
      );
      showGender();
    });
  };

  const label = h('input', { type: 'text', class: 'field', id: 'f-label', value: schoolClass.label });
  label.addEventListener('change', () => {
    const newLabel = cleanName(label.value);
    const conflicting = duplicateClass(getData().classes, newLabel, id);
    if (newLabel === '') notice(T.errLabelEmpty, 'error');
    else if (conflicting) notice(T.errLabelEdit(conflicting.label), 'error');
    else {
      change(() => (schoolClass.label = newLabel));
      label.value = newLabel;
      return;
    }
    label.value = schoolClass.label;
  });
  const tutor = h('input', {
    type: 'text',
    class: 'field',
    id: 'f-tutor',
    value: schoolClass.tutor,
    placeholder: T.tutorPlaceholder,
    autocomplete: 'off',
  });
  tutor.addEventListener('change', () => {
    const name = parseTutor(tutor.value);
    tutor.value = name;
    change(() => (schoolClass.tutor = name));
  });

  // Add one student at a time
  const newNameInput = h('input', {
    type: 'text',
    class: 'field',
    placeholder: T.newStudentPlaceholder,
    'aria-label': T.addStudent,
    autocomplete: 'off',
  });
  const addOne = (): void => {
    const n = cleanName(newNameInput.value);
    if (n === '') return void newNameInput.focus();
    const r = addNames([n]);
    if (r.skipped > 0) return notice(T.errNameDuplicate(n), 'error');
    newNameInput.value = '';
    renderList();
    newNameInput.focus();
  };
  newNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOne();
    }
  });

  const pasted = h('textarea', { class: 'field', rows: '4', id: 'f-paste', placeholder: T.namesExample });

  root.append(
    stepsBanner(2),
    h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/steps') }, T.backToClasses),
    h('h1', {}, T.classDetails),
    autosaveBanner(),
    h(
      'section',
      { class: 'section' },
      h('h2', {}, T.sectionClassData),
      h(
        'div',
        { class: 'form' },
        h('label', { for: 'f-label' }, T.label),
        label,
        h('label', { for: 'f-tutor' }, T.tutor),
        tutor,
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', {}, T.students),
      h('p', { class: 'muted' }, T.genderHelp),
      h('p', { class: 'muted' }, T.workshopHelp),
      duplicatesEl,
      list,
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', {}, T.sectionAddStudents),
      h(
        'div',
        { class: 'box' },
        h('h3', {}, T.addOneTitle),
        h('p', { class: 'muted' }, T.addOneHelp),
        h(
          'div',
          { class: 'add-row' },
          newNameInput,
          h('button', { class: 'btn', type: 'button', onclick: addOne }, T.add),
        ),
      ),
      h(
        'div',
        { class: 'box' },
        h('h3', {}, T.pasteTitle),
        h('p', { class: 'muted' }, T.pasteHelp),
        pasted,
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                const { addedCount, skipped } = addNames(pasted.value.split(/\r?\n/));
                if (addedCount === 0 && skipped === 0) return;
                pasted.value = '';
                renderList();
                if (addedCount > 0) notice(T.namesAdded(addedCount), 'ok');
                if (skipped > 0) notice(T.duplicatesSkipped(skipped), 'error');
              },
            },
            T.addPasted,
          ),
        ),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', {}, T.sectionWhenDone),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => goTo('#/steps') }, T.doneBackToClasses),
        h('button', { class: 'btn', type: 'button', onclick: () => goTo(`#/class/${id}`) }, T.goGradesOfClass),
        h(
          'button',
          { class: 'btn', type: 'button', onclick: () => goTo(`#/class/${id}/attendance`) },
          T.goAttendanceOfClass,
        ),
        h('button', { class: 'btn', type: 'button', onclick: () => goTo(`#/class/${id}/norms`) }, T.goNormsOfClass),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'box danger-zone' },
        h('h3', {}, T.dangerTitle),
        h('p', { class: 'muted' }, T.dangerHelp),
        h(
          'button',
          {
            class: 'btn btn-danger-soft',
            type: 'button',
            onclick: async () => {
              if (await confirmDialog(T.removeClassTitle, T.removeClassText(schoolClass.label), T.remove, true)) {
                removeClassById(id);
                goTo('#/steps');
              }
            },
          },
          T.deleteClass,
        ),
      ),
    ),
  );
  renderList();
  return { el: root };
}
