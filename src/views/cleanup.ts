import { h, clearChildren, notice, download, formatSize, fileDropZone, MIME_XLSX } from '../ui/dom';
import { safeFileName } from '../domain/text';
import { T } from '../ui/texts';
import { cleanFile, errorMessage } from '../import/worker-client';
import { goTo, type View } from './view';

export function cleanupView(): View {
  const root = h('div', { class: 'screen' });
  const result = h('div', { class: 'result' });

  async function handleFile(file: File): Promise<void> {
    clearChildren(result);
    if (/\.xls$/i.test(file.name)) return notice(T.legacyFormat, 'error');
    result.append(h('p', { class: 'status', role: 'status' }, T.cleaning));
    try {
      const r = await cleanFile(file);
      clearChildren(result);
      if (r.removed === 0) {
        result.append(h('div', { class: 'success-banner' }, T.cleanNotNeeded));
        return;
      }
      const base = safeFileName(file.name.replace(/\.xlsx$/i, ''));
      result.append(
        h(
          'div',
          { class: 'success-banner' },
          h('strong', {}, `✓ ${T.cleanDoneTitle}`),
          h('p', {}, T.cleanSummary(formatSize(r.before), formatSize(r.after))),
          h(
            'button',
            {
              class: 'btn btn-primary',
              type: 'button',
              onclick: () => download(r.bytes, `${base} (liviano).xlsx`, MIME_XLSX),
            },
            T.downloadClean,
          ),
        ),
      );
    } catch (err) {
      clearChildren(result);
      notice(errorMessage(err), 'error');
    }
  }

  root.append(
    h('button', { class: 'btn btn-text', type: 'button', onclick: () => goTo('#/') }, T.back),
    h('h1', {}, T.cleanupTitle),
    h('p', {}, T.cleanupHelp),
    fileDropZone('.xlsx', (f) => void handleFile(f), T.chooseFile, T.xlsxFile),
    result,
  );
  return { el: root };
}
