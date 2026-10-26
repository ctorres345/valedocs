import './ui/styles.css';
import { onNotice, load, flushSave, storedDataUnreadable } from './storage/store';
import { notice, h, clearChildren } from './ui/dom';
import { T } from './ui/texts';
import { loadLogos } from './storage/logos';
import type { View } from './views/view';
import { homeView } from './views/home';
import { registerView, reportView } from './views/register';
import { gradesView } from './views/grades';
import { attendanceView } from './views/attendance';
import { monthsView } from './views/months';
import { normsView } from './views/norms';
import { normsExportView } from './views/norms-export';
import { quarterView } from './views/quarter';
import { quarterExportView } from './views/quarter-export';
import { consolidatedView } from './views/consolidated';
import { classDetailsView } from './views/class-details';
import { exportView } from './views/export-report';
import { settingsView } from './views/settings';
import { cleanupView } from './views/cleanup';
import { newClassView } from './views/new-class';

const app = document.getElementById('app')!;
let current: View | null = null;

function pick(route: string): View {
  const parts = route.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'class' && parts[1]) {
    if (parts[2] === 'details') return classDetailsView(parts[1]);
    if (parts[2] === 'attendance')
      return parts[3] ? attendanceView(parts[1], parts[3]) : monthsView(parts[1], 'attendance');
    if (parts[2] === 'quarter') return quarterView(parts[1]);
    if (parts[2] === 'norms') return parts[3] ? normsView(parts[1], parts[3]) : monthsView(parts[1], 'norms');
    return gradesView(parts[1]);
  }
  if (parts[0] === 'steps') return registerView();
  if (parts[0] === 'conduct') return reportView('conduct');
  if (parts[0] === 'attendance') return reportView('attendance');
  if (parts[0] === 'norms') return reportView('norms');
  if (parts[0] === 'quarter') return reportView('quarter');
  if (parts[0] === 'new') return newClassView();
  if (parts[0] === 'export' && parts[1] === 'consolidated') return consolidatedView();
  if (parts[0] === 'export' && parts[1] === 'quarter') return quarterExportView(parts[2]);
  if (parts[0] === 'export' && parts[1] === 'norms') return normsExportView(parts[2], parts[3]);
  if (parts[0] === 'export') return exportView(parts[1] === 'attendance' ? 'attendance' : 'conduct', parts[2]);
  if (parts[0] === 'settings') return settingsView();
  if (parts[0] === 'cleanup') return cleanupView();
  return homeView();
}

function show(): void {
  current?.destroy?.();
  clearChildren(app);
  try {
    current = pick(location.hash);
    app.append(current.el);
  } catch (err) {
    console.error(err);
    current = null;
    app.append(h('p', { class: 'warning-banner' }, T.generalError));
  }
  window.scrollTo(0, 0);
  document.title = T.app;
}

/** Top-bar button that enlarges the text of the whole page (remembered in this browser). */
function initLargeText(): void {
  const button = document.getElementById('text-size');
  if (!button) return;
  const apply = (large: boolean): void => {
    document.documentElement.classList.toggle('large-text', large);
    button.textContent = large ? T.normalText : T.largeText;
    button.setAttribute('aria-pressed', String(large));
  };
  let large = false;
  try {
    large = localStorage.getItem('valedocs:text-size') === 'large';
  } catch {
    /* no local storage: normal text size */
  }
  apply(large);
  button.addEventListener('click', () => {
    large = !large;
    apply(large);
    try {
      localStorage.setItem('valedocs:text-size', large ? 'large' : 'normal');
    } catch {
      /* not critical */
    }
  });
}

const SUN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></svg>';
const MOON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>';

/**
 * Top-bar button that switches between day and night colours (remembered in this browser).
 * Until she picks one, the app follows the device setting.
 */
function initTheme(): void {
  const button = document.getElementById('theme');
  if (!button) return;
  const deviceDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('valedocs:theme');
  } catch {
    /* no local storage: follow the device */
  }
  const isDark = (): boolean => (saved === 'dark' || saved === 'light' ? saved === 'dark' : !!deviceDark?.matches);
  const apply = (): void => {
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
    else document.documentElement.removeAttribute('data-theme');
    const dark = isDark();
    // The button names what it switches to
    button.innerHTML = `${dark ? SUN : MOON}<span>${dark ? T.day : T.night}</span>`;
    button.setAttribute('aria-label', dark ? T.toDay : T.toNight);
    button.title = dark ? T.toDay : T.toNight;
  };
  apply();
  deviceDark?.addEventListener?.('change', apply);
  button.addEventListener('click', () => {
    saved = isDark() ? 'light' : 'dark';
    apply();
    try {
      localStorage.setItem('valedocs:theme', saved);
    } catch {
      /* not critical */
    }
  });
}

async function start(): Promise<void> {
  initTheme();
  initLargeText();
  onNotice((code) => notice(code === 'locked' ? T.storedDataUnreadable : T.cannotSave, 'error'));
  await Promise.all([load(), loadLogos()]);
  if (storedDataUnreadable()) notice(T.storedDataUnreadable, 'error');
  window.addEventListener('hashchange', show);
  window.addEventListener('pagehide', () => void flushSave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSave();
  });
  show();
}

void start();
