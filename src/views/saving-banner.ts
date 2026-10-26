import { h } from '../ui/dom';
import { T } from '../ui/texts';
import { savingWorks, storedDataUnreadable } from '../storage/store';

/** Warning shown on the main screens when changes are not being saved; null when everything is fine. */
export function savingBanner(): HTMLElement | null {
  if (storedDataUnreadable()) return h('div', { class: 'warning-banner' }, T.storedDataUnreadable);
  return savingWorks() ? null : h('div', { class: 'warning-banner' }, T.cannotSave);
}

/** Reassurance shown on screens that save automatically, so she never worries about leaving. */
export function autosaveBanner(): HTMLElement {
  // When stored data could not be read nothing is saved: never promise it here
  if (storedDataUnreadable()) return h('div', { class: 'warning-banner', role: 'status' }, T.storedDataUnreadable);
  return h('div', { class: 'saved-banner', role: 'status' }, T.autosavedBanner);
}
