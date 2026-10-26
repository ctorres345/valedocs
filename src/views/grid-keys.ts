/**
 * Pieces shared by the entry screens (grades, attendance, norms): remembered entry mode, undo stack, keyboard
 * navigation and the "next column/day" button. Each screen keeps its own data and rendering.
 */
import { h } from '../ui/dom';

const UNDO_LIMIT = 50;

/** Entry mode remembered between visits; `fallback` is used on first visit or without local storage. */
export function loadMode<M extends string>(key: string, valid: readonly M[], fallback: () => M): M {
  try {
    const saved = localStorage.getItem(key);
    const found = valid.find((m) => m === saved);
    if (found) return found;
  } catch {
    /* no local storage: the default value is used */
  }
  return fallback();
}

export function saveMode(key: string, mode: string): void {
  try {
    localStorage.setItem(key, mode);
  } catch {
    /* not critical */
  }
}

/** Phones and touch screens start in the big-button mode, desktops in the keyboard grid. */
export const isTouchLayout = (): boolean => window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;

/** Serialized snapshots, newest last, capped. */
export interface UndoStack {
  push(snapshot: string): void;
  pop(): string | undefined;
}

export function createUndoStack(): UndoStack {
  const stack: string[] = [];
  return {
    push(snapshot) {
      stack.push(snapshot);
      if (stack.length > UNDO_LIMIT) stack.shift();
    },
    pop: () => stack.pop(),
  };
}

export interface GridKeys {
  /** False when the grid is not the active mode or has no rows. */
  active(): boolean;
  rowCount(): number;
  colCount(): number;
  position(): { row: number; col: number };
  moveTo(row: number, col: number): void;
  undo(): void;
  clearCell(): void;
  /** Mark/grade for a typed letter (already upper-cased), or null when the letter is not used. */
  valueFor(letter: string): string | null;
  /** Writes the value into the selected cell and moves to the next row. */
  enter(value: string): void;
}

/** Keydown handler for an entry grid: arrows, Enter, Tab, Delete, Ctrl+Z and the screen's own letters. */
export function gridKeydown(g: GridKeys): (e: KeyboardEvent) => void {
  return (e) => {
    if (!g.active()) return;
    if (document.querySelector('.dialog-backdrop')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    // Other buttons keep their normal keyboard behaviour (Enter/Space); only the cells use arrows and letters
    if (t && t.tagName === 'BUTTON' && !t.classList.contains('cell')) return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        g.undo();
      }
      return;
    }
    if (e.altKey) return;
    const rows = g.rowCount();
    const cols = g.colCount();
    const { row, col } = g.position();
    const clamp = (v: number, max: number): number => Math.min(max - 1, Math.max(0, v));
    const move = (df: number, dk: number): void => {
      e.preventDefault();
      g.moveTo(clamp(row + df, rows), clamp(col + dk, cols));
    };
    switch (e.key) {
      case 'ArrowDown':
      case 'Enter':
        return move(1, 0);
      case 'ArrowUp':
        return move(-1, 0);
      case 'ArrowLeft':
        return move(0, -1);
      case 'ArrowRight':
        return move(0, 1);
      case 'Tab': {
        e.preventDefault();
        const k = col + (e.shiftKey ? -1 : 1);
        if (k >= cols) return g.moveTo(clamp(row + 1, rows), 0);
        if (k < 0) return g.moveTo(clamp(row - 1, rows), cols - 1);
        return g.moveTo(row, k);
      }
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        return g.clearCell();
    }
    if (e.key.length === 1) {
      const value = g.valueFor(e.key.toUpperCase());
      if (value) {
        e.preventDefault();
        g.enter(value);
      }
    }
  };
}

/** Big button at the end of a phone list that opens the next column or day, so she never scrolls back up for it. */
export function nextStepButton(text: string, onclick: () => void): HTMLElement {
  return h(
    'div',
    { class: 'actions' },
    h('button', { class: 'btn btn-primary btn-big next-step', type: 'button', onclick }, text),
  );
}
