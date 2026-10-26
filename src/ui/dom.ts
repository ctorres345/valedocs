import { T } from './texts';

type Child = Node | string | null | undefined | false;
type Attributes = Record<string, string | number | boolean | EventListener | undefined | null>;

/** Creates an element: h('button', { class: 'x', onclick: fn }, 'Text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attributes = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function download(data: Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([data as BlobPart], { type: type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MIME_PDF = 'application/pdf';
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIME_ZIP = 'application/zip';

export function formatSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

// ---------- Notices and dialogs (all Spanish; the browser's own dialogs are not used) ----------

let noticeArea: HTMLElement | null = null;

/** A short message at the bottom of the screen; `action` adds a button to it (e.g. undo what was just done). */
export function notice(
  text: string,
  type: 'ok' | 'error' | 'info' = 'info',
  action?: { label: string; run: () => void },
): void {
  if (!noticeArea) {
    noticeArea = h('div', { class: 'notices', role: 'status', 'aria-live': 'polite' });
    document.body.append(noticeArea);
  }
  const el = h('div', { class: `notice notice-${type}` }, h('span', {}, text));
  if (action)
    el.append(
      h(
        'button',
        {
          class: 'notice-action',
          type: 'button',
          onclick: () => {
            el.remove();
            action.run();
          },
        },
        action.label,
      ),
    );
  noticeArea.append(el);
  // Longer with a button, so there is time to reach it
  setTimeout(() => el.remove(), type === 'error' ? 8000 : action ? 7000 : 4000);
}

interface DialogOptions {
  title: string;
  text?: string;
  content?: Node;
  accept?: string;
  cancel?: string | null;
  danger?: boolean;
}

export function dialog(options: DialogOptions, onAccept: () => boolean | void, onClose: () => void): HTMLElement {
  const backdrop = h('div', { class: 'dialog-backdrop' });
  const close = (): void => {
    backdrop.remove();
    document.removeEventListener('keydown', onKeys, true);
    onClose();
  };
  const onKeys = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKeys, true);
  const buttons = h(
    'div',
    { class: 'dialog-buttons' },
    options.cancel === null
      ? null
      : h('button', { class: 'btn', type: 'button', onclick: close }, options.cancel ?? T.cancel),
    h(
      'button',
      {
        class: `btn ${options.danger ? 'btn-danger' : 'btn-primary'}`,
        type: 'button',
        onclick: () => {
          if (onAccept() !== false) close();
        },
      },
      options.accept ?? T.accept,
    ),
  );
  const checkbox = h(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
    h('h2', {}, options.title),
    options.text ? h('p', {}, options.text) : null,
    options.content,
    buttons,
  );
  backdrop.append(checkbox);
  document.body.append(backdrop);
  return backdrop;
}

export function confirmDialog(
  title: string,
  text: string,
  accept = T.yes,
  danger = false,
  cancel?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let decided = false;
    dialog(
      { title, text, accept, danger, cancel },
      () => {
        decided = true;
        resolve(true);
      },
      () => {
        if (!decided) resolve(false);
      },
    );
  });
}

/** Asks for a text; returns null if cancelled. */
export function ask(
  title: string,
  text: string,
  initial = '',
  suggestions: string[] = [],
  accept = T.save,
): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', class: 'field', value: initial, 'aria-label': title });
    const chips = suggestions.length
      ? h(
          'div',
          { class: 'chips' },
          suggestions.map((s) =>
            h(
              'button',
              {
                class: 'chip',
                type: 'button',
                onclick: () => {
                  input.value = s;
                  input.focus();
                },
              },
              s,
            ),
          ),
        )
      : null;
    let decided = false;
    const backdrop = dialog(
      { title, text, content: h('div', {}, input, chips), accept },
      () => {
        decided = true;
        resolve(input.value.trim());
      },
      () => {
        if (!decided) resolve(null);
      },
    );
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (backdrop.querySelector('.btn-primary') as HTMLButtonElement).click();
    });
    setTimeout(() => input.focus(), 0);
  });
}

/** Button that opens the file picker with Spanish text. */
export function filePicker(
  text: string,
  accept: string,
  onPick: (f: File) => void,
  schoolClass = 'btn btn-primary',
): HTMLElement {
  const input = h('input', { type: 'file', accept: accept, class: 'hidden', tabindex: '-1' });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) onPick(f);
  });
  return h('span', {}, input, h('button', { class: schoolClass, type: 'button', onclick: () => input.click() }, text));
}

/** Drop zone for a file, with a button to pick it (Spanish text). */
export function fileDropZone(accept: string, onPick: (f: File) => void, text: string, help: string): HTMLElement {
  const dropZone = h(
    'div',
    { class: 'file-zone' },
    h('p', { class: 'file-zone-help' }, help),
    filePicker(text, accept, onPick),
    h('p', { class: 'file-zone-or' }, T.dragHere),
  );
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    const f = e.dataTransfer?.files?.[0];
    if (f) onPick(f);
  });
  return dropZone;
}

/** One option: its button on the left and a short explanation of what it does next to it. */
export function optionRow(control: HTMLElement, help: string): HTMLElement {
  return h('div', { class: 'option-row' }, control, h('p', { class: 'muted' }, help));
}

/** Progress bar for "done of total" with a text alternative. */
export function progressBar(done: number, total: number): HTMLElement {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return h(
    'div',
    { class: 'progress-bar', role: 'img', 'aria-label': T.completed(done, total) },
    h('div', { class: 'progress-fill', style: `width:${percent}%` }),
  );
}

/** Row of tab buttons (role=tablist); `pick` gets the key of the tab she clicked. */
export function tabList(
  label: string | null,
  items: { key: string; text: string }[],
  active: string | null,
  pick: (key: string) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'tabs', role: 'tablist', ...(label ? { 'aria-label': label } : {}) },
    items.map(({ key, text }) =>
      h(
        'button',
        {
          class: `tab ${key === active ? 'active' : ''}`,
          type: 'button',
          role: 'tab',
          'aria-selected': String(key === active),
          onclick: () => pick(key),
        },
        text,
      ),
    ),
  );
}
