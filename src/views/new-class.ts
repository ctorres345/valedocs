import { h, clearChildren, notice, confirmDialog } from '../ui/dom';
import { T } from '../ui/texts';
import { stepsBanner } from '../ui/steps';
import { change, getData } from '../storage/store';
import { cleanName, newStudent, newClass, parseTutor } from '../domain/model';
import { validateNewClass, type ClassProblem } from '../domain/validation';
import { goTo, type View } from './view';

function message(p: ClassProblem): string {
  switch (p.type) {
    case 'label-empty':
      return T.errLabelEmpty;
    case 'label-duplicate':
      return T.errLabelDuplicate(p.other);
    case 'no-students':
      return T.errNoStudents;
    case 'duplicate-names':
      return T.errNamesDuplicated(p.names);
  }
}

/** Form to register a class by hand. Nothing is saved until "Guardar clase" is pressed. */
export function newClassView(): View {
  const label = h('input', {
    type: 'text',
    class: 'field',
    id: 'f-label',
    placeholder: T.labelExample,
    autocomplete: 'off',
  });
  const tutor = h('input', {
    type: 'text',
    class: 'field',
    id: 'f-tutor',
    placeholder: T.tutorPlaceholder,
    autocomplete: 'off',
  });
  const names = h('textarea', { class: 'field', rows: '10', id: 'f-names', placeholder: T.namesExample });
  const errors = h('div', { role: 'alert' });

  /** Leaving is the only place where data can be lost, so ask if she already typed something. */
  async function leave(): Promise<void> {
    const typed = [label.value, tutor.value, names.value].some((v) => v.trim() !== '');
    if (typed && !(await confirmDialog(T.discardTitle, T.discardText, T.discardConfirm, true, T.keepEditing))) return;
    goTo('#/steps');
  }

  function save(): void {
    const list = names.value
      .split(/\r?\n/)
      .map(cleanName)
      .filter((n) => n !== '');
    const problems = validateNewClass(getData().classes, label.value, list);
    clearChildren(errors);
    if (problems.length > 0) {
      errors.append(
        h(
          'div',
          { class: 'warning-banner' },
          h(
            'ul',
            {},
            problems.map((p) => h('li', {}, message(p))),
          ),
        ),
      );
      (problems[0].type.startsWith('label') ? label : names).focus();
      return;
    }
    const n = getData().settings.columns.length;
    change((d) =>
      d.classes.push(
        newClass(
          cleanName(label.value),
          parseTutor(tutor.value),
          list.map((name) => newStudent(name, n)),
        ),
      ),
    );
    notice(T.classSaved, 'ok');
    goTo('#/steps');
  }

  const root = h(
    'div',
    { class: 'screen' },
    stepsBanner(1),
    h('button', { class: 'btn btn-text', type: 'button', onclick: () => void leave() }, T.backToClasses),
    h('h1', {}, T.newClassTitle),
    h('p', { class: 'muted' }, T.newClassHelp),
    h(
      'div',
      { class: 'form' },
      h('label', { for: 'f-label' }, T.label),
      label,
      h('label', { for: 'f-tutor' }, T.tutor),
      tutor,
      h('label', { for: 'f-names' }, T.namesOnePerLine),
      names,
    ),
    errors,
    h(
      'div',
      { class: 'actions spaced' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: save }, T.saveClass),
      h('button', { class: 'btn', type: 'button', onclick: () => void leave() }, T.cancel),
    ),
  );
  return { el: root };
}
