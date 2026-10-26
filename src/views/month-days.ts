import { h, dialog } from '../ui/dom';
import { T } from '../ui/texts';
import { monthKey, monthLabels, monthName, weekdayOf, weekdaysOf } from '../domain/attendance';
import type { MonthKey } from '../domain/model';

/**
 * Asks which days of the month had school (Monday to Friday, all ticked at first).
 * Returns the chosen day numbers, or null if she cancelled.
 */
export function chooseDays(month: MonthKey, selected: number[] | null): Promise<number[] | null> {
  return new Promise((resolve) => {
    const options = weekdaysOf(month);
    const ticked = new Set(selected ?? options);
    const boxes = options.map((day) => {
      const box = h('input', { type: 'checkbox', class: 'checkbox', id: `day-${day}` });
      box.checked = ticked.has(day);
      return { day, box };
    });
    const grid = h(
      'div',
      { class: 'day-picker' },
      boxes.map(({ day, box }) =>
        h(
          'label',
          { class: 'day-option', for: `day-${day}` },
          box,
          h('span', {}, T.dayLabel(T.weekdayShort[weekdayOf(month, day) - 1], day)),
        ),
      ),
    );
    const warning = h('p', { class: 'missing' });
    let decided = false;
    dialog(
      {
        title: T.chooseDaysTitle(monthName(month)),
        text: T.chooseDaysText,
        content: h('div', {}, grid, warning),
        accept: T.save,
      },
      () => {
        const days = boxes.filter(({ box }) => box.checked).map(({ day }) => day);
        if (days.length === 0) {
          warning.textContent = T.chooseDaysNone;
          return false;
        }
        decided = true;
        resolve(days);
      },
      () => {
        if (!decided) resolve(null);
      },
    );
  });
}

/** Month and year selectors (this month preselected); `key()` gives the chosen "YYYY-MM". */
export function monthPicker(): { el: HTMLElement; key: () => MonthKey } {
  const now = new Date();
  const month = h(
    'select',
    { class: 'field', id: 'pick-month', 'aria-label': T.month },
    monthLabels().map((name, i) => h('option', { value: i + 1, selected: i === now.getMonth() }, name)),
  );
  const year = h(
    'select',
    { class: 'field', id: 'pick-year', 'aria-label': T.year },
    [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) =>
      h('option', { value: y, selected: y === now.getFullYear() }, String(y)),
    ),
  );
  return {
    el: h(
      'div',
      { class: 'month-form' },
      h('label', { for: 'pick-month' }, T.month),
      month,
      h('label', { for: 'pick-year' }, T.year),
      year,
    ),
    key: () => monthKey(Number(year.value), Number(month.value)),
  };
}

/** Asks for a month and then its school days (all weekdays ticked at first); null if she cancels at any point. */
export function chooseMonthAndDays(): Promise<{ month: MonthKey; days: number[] } | null> {
  return new Promise((resolve) => {
    const picker = monthPicker();
    let month: MonthKey | null = null;
    dialog(
      { title: T.chooseMonth, content: picker.el, accept: T.registerContinue },
      () => {
        month = picker.key();
      },
      () => {
        if (month === null) return resolve(null);
        const chosen = month;
        void chooseDays(chosen, weekdaysOf(chosen)).then((days) => resolve(days ? { month: chosen, days } : null));
      },
    );
  });
}
