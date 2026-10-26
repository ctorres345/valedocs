import { h, clearChildren, confirmDialog, notice, filePicker, download, optionRow } from '../ui/dom';
import { setLogos, logoFromBlob, logosFromWorkbook, customLogos, getLogos } from '../storage/logos';
import { T } from '../ui/texts';
import { applySchoolPack, change, createSchoolPack, getData, readSchoolPack } from '../storage/store';
import {
  fitGrades,
  defaultSettings,
  defaultNormsCriteria,
  DEFAULT_GRADES,
  NORMS_GRADES,
  type Settings,
} from '../domain/model';
import { goTo, type View } from './view';

type Field = 'institution1' | 'institution2' | 'title1' | 'title2' | 'term' | 'uniformNote';

function logosBlock(rerender: () => void): HTMLElement {
  const currentLogos = getLogos();
  const row = (title: string, side: 'left' | 'right'): HTMLElement => {
    const logo = currentLogos[side];
    return h(
      'div',
      { class: 'logo-row' },
      h('strong', {}, title),
      logo
        ? h('img', { src: logo.uri, alt: title, class: 'logo-thumb' })
        : h('span', { class: 'logo-thumb logo-empty muted' }, T.noLogo),
      h(
        'div',
        { class: 'actions' },
        filePicker(
          T.chooseImage,
          'image/png,image/jpeg',
          async (f) => {
            try {
              await setLogos({ ...customLogos(), [side]: await logoFromBlob(f) });
              notice(T.logosSaved, 'ok');
              rerender();
            } catch {
              notice(T.invalidImage, 'error');
            }
          },
          'btn btn-small',
        ),
        logo
          ? h(
              'button',
              {
                class: 'btn btn-small btn-danger-soft',
                type: 'button',
                onclick: async () => {
                  await setLogos({ ...customLogos(), [side]: null });
                  rerender();
                },
              },
              T.removeLogo,
            )
          : null,
      ),
    );
  };
  return h(
    'section',
    { class: 'section' },
    h('h2', {}, T.logosTitle),
    h('p', { class: 'muted' }, T.logosHelp),
    h(
      'div',
      { class: 'actions' },
      filePicker(T.logosFromReport, '.xlsx', async (f) => {
        try {
          const l = await logosFromWorkbook(new Uint8Array(await f.arrayBuffer()));
          if (!l.left && !l.right) return notice(T.logosNotFound, 'error');
          await setLogos(l);
          notice(T.logosSaved, 'ok');
          rerender();
        } catch {
          notice(T.notExcel, 'error');
        }
      }),
    ),
    row(T.leftLogo, 'left'),
    row(T.rightLogo, 'right'),
  );
}

/** Download or load the school's settings and logos as one file, to carry them to another device or teacher. */
function schoolPackBlock(rerender: () => void): HTMLElement {
  return h(
    'section',
    { class: 'section' },
    h('h2', {}, T.schoolPackTitle),
    h('p', { class: 'muted' }, T.schoolPackHelp),
    optionRow(
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => download(createSchoolPack(), `${T.schoolPackPrefix}.json`, 'application/json'),
        },
        T.downloadSchoolPack,
      ),
      T.optionDownloadSchoolPackHelp,
    ),
    optionRow(
      filePicker(
        T.loadSchoolPack,
        '.json,application/json',
        async (f) => {
          const pack = readSchoolPack(await f.text());
          if (!pack) return notice(T.schoolPackInvalid, 'error');
          if (await confirmDialog(T.schoolPackLoadTitle, T.schoolPackLoadText, T.yes, true)) {
            await applySchoolPack(pack);
            notice(T.schoolPackLoaded, 'ok');
            rerender();
          }
        },
        'btn',
      ),
      T.optionLoadSchoolPackHelp,
    ),
  );
}

/** Title of the monthly norms report and the paragraph printed for each grade of each criterion. */
function normsSection(settings: Settings, rerender: () => void): HTMLElement {
  const title = h('input', { type: 'text', class: 'field', id: 'set-norms-title', value: settings.normsTitle });
  title.addEventListener('input', () => change((d) => (d.settings.normsTitle = title.value)));
  // An empty title is not saved: the default comes back when she leaves the field
  title.addEventListener('change', () => {
    if (title.value.trim() !== '') return;
    title.value = defaultSettings().normsTitle;
    change((d) => (d.settings.normsTitle = title.value));
  });
  return h(
    'section',
    { class: 'norms-settings' },
    h('h2', {}, T.normsSettingsTitle),
    h('p', { class: 'muted' }, T.normsSettingsHelp),
    h('div', { class: 'form' }, h('label', { for: 'set-norms-title' }, T.normsTitleLabel), title),
    settings.normsCriteria.map((criterion, i) =>
      h(
        'div',
        { class: 'form norms-criterion' },
        h('h3', {}, criterion.name),
        (['texts', 'textsFemale'] as const).flatMap((which) => [
          h('h4', {}, which === 'texts' ? T.normsMaleTexts : T.normsFemaleTexts),
          ...NORMS_GRADES.flatMap((grade, k) => {
            const id = `set-norms-${i}-${which}-${k}`;
            const text = h('textarea', { class: 'field', id, rows: 3 });
            text.value = criterion[which][k] ?? '';
            text.addEventListener('input', () => change((d) => (d.settings.normsCriteria[i][which][k] = text.value)));
            return [h('label', { for: id }, T.normsGradeLabel(grade)), text];
          }),
        ]),
      ),
    ),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            if (!(await confirmDialog(T.restoreNormsTexts, T.restoreNormsTextsText, T.yes, true))) return;
            change((d) => {
              d.settings.normsTitle = defaultSettings().normsTitle;
              d.settings.normsCriteria = defaultNormsCriteria();
            });
            rerender();
          },
        },
        T.restoreNormsTexts,
      ),
    ),
  );
}

export function settingsView(): View {
  const root = h('div', { class: 'screen' });

  function field(key: Field, label: string, placeholder?: string): HTMLElement[] {
    const input = h('input', {
      type: 'text',
      class: 'field',
      id: `set-${key}`,
      value: getData().settings[key],
      placeholder,
    });
    input.addEventListener('input', () => change((d) => (d.settings[key] = input.value)));
    return [h('label', { for: `set-${key}` }, label), input];
  }

  function render(): void {
    clearChildren(root);
    const settings: Settings = getData().settings;
    const allowed = h('input', {
      type: 'text',
      class: 'field',
      id: 'set-grades',
      value: settings.allowedGrades.join(', '),
    });
    allowed.addEventListener('change', () => {
      const list = [
        ...new Set(
          allowed.value
            .split(/[,;\s]+/)
            .map((s) => s.trim().toUpperCase())
            .filter((s) => s !== ''),
        ),
      ];
      change((d) => (d.settings.allowedGrades = list.length ? list : [...DEFAULT_GRADES]));
      allowed.value = getData().settings.allowedGrades.join(', ');
    });

    root.append(
      h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/') }, T.back),
      h('h1', {}, T.settingsTitle),
      h('p', { class: 'muted' }, T.settingsHelp),
      h(
        'div',
        { class: 'form' },
        field('institution1', T.institution1),
        field('institution2', T.institution2),
        field('title1', T.title1),
        field('title2', T.title2),
        field('term', T.term),
        h('p', { class: 'muted' }, T.uniformNoteHelp),
        field('uniformNote', T.uniformNote, T.uniformNotePlaceholder),
      ),
      logosBlock(render),
      schoolPackBlock(render),
      h('h2', {}, T.columnsTitle),
      h('p', { class: 'muted' }, T.columnsHelp),
      h(
        'div',
        { class: 'column-list' },
        settings.columns.map((col, k) => {
          const line1 = h('input', {
            type: 'text',
            class: 'field',
            value: col.line1,
            'aria-label': `${T.firstLine} ${k + 1}`,
          });
          const line2 = h('input', {
            type: 'text',
            class: 'field',
            value: col.line2,
            'aria-label': `${T.secondLine} ${k + 1}`,
          });
          line1.addEventListener('input', () => change((d) => (d.settings.columns[k].line1 = line1.value)));
          line2.addEventListener('input', () => change((d) => (d.settings.columns[k].line2 = line2.value)));
          return h(
            'div',
            { class: 'column-row' },
            h('span', { class: 'num' }, String(k + 1)),
            h('div', { class: 'field-pair' }, h('label', {}, T.firstLine, line1), h('label', {}, T.secondLine, line2)),
            h(
              'button',
              {
                class: 'btn btn-small btn-danger-soft',
                type: 'button',
                'aria-label': `${T.removeColumn} ${col.line1}`,
                onclick: async () => {
                  if (getData().settings.columns.length <= 1)
                    return void (await confirmDialog(T.removeColumn, T.minOneColumn, T.accept));
                  if (
                    !(await confirmDialog(
                      `${T.removeColumn}: ${col.line1}`,
                      T.removeColumnWarning,
                      T.removeColumn,
                      true,
                    ))
                  )
                    return;
                  change((d) => {
                    d.settings.columns.splice(k, 1);
                    for (const c of d.classes) for (const a of c.students) a.grades.splice(k, 1);
                  });
                  render();
                },
              },
              T.removeColumn,
            ),
          );
        }),
      ),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: () => {
              change((d) => {
                d.settings.columns.push({ line1: T.newColumn, line2: '' });
                fitGrades(d.classes, d.settings.columns.length);
              });
              render();
            },
          },
          T.addColumn,
        ),
      ),
      normsSection(settings, render),
      h('h2', {}, T.allowedGrades),
      h('p', { class: 'muted' }, T.allowedGradesHelp),
      h('div', { class: 'form' }, allowed),
      h(
        'div',
        { class: 'actions spaced' },
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: async () => {
              if (!(await confirmDialog(T.restoreSettings, T.restoreSettingsText, T.yes, true))) return;
              change((d) => {
                const base = defaultSettings();
                d.settings = {
                  ...base,
                  term: d.settings.term,
                  uniformNote: d.settings.uniformNote,
                  normsTitle: d.settings.normsTitle,
                  normsCriteria: d.settings.normsCriteria,
                };
                fitGrades(d.classes, base.columns.length);
              });
              render();
            },
          },
          T.restoreSettings,
        ),
      ),
      h('p', { class: 'muted footer-note' }, T.autosaved),
    );
  }

  render();
  return { el: root };
}
