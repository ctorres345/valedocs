import { describe, expect, it } from 'vitest';
import {
  attendancePendingOf,
  findMonth,
  isAttendanceComplete,
  monthName,
  monthTitle,
  pendingMonths,
  recordOf,
  setMonthDays,
  summarize,
  weekdaysOf,
} from '../src/domain/attendance';
import { newClass, newStudent } from '../src/domain/model';

const sample = () =>
  newClass('5° A - SECUNDARIA', 'Ana Prueba', [newStudent('PEREZ, ANA', 3), newStudent('LUNA, ROSA', 3)]);

describe('months', () => {
  it('lists the weekdays of September 2026 like her report', () => {
    expect(weekdaysOf('2026-09')).toEqual([
      1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 28, 29, 30,
    ]);
  });
  it('handles February of a leap year and bad keys', () => {
    expect(weekdaysOf('2028-02')).toHaveLength(21);
    expect(weekdaysOf('nope')).toEqual([]);
  });
  it('writes the month title as on her report', () => {
    expect(monthTitle('2026-09')).toBe('MES DE SETIEMBRE DEL 2026');
    expect(monthName('2026-03')).toBe('Marzo 2026');
  });
});

describe('summarize', () => {
  it('counts only non-present marks, in a fixed order', () => {
    expect(summarize(['A', 'F', 'T', 'A', 'T', 'F', 'J', 'U', ''])).toBe('2T  2F  1J  1U');
  });
  it('is empty when everything is present', () => {
    expect(summarize(['A', 'A'])).toBe('');
  });
});

describe('class months', () => {
  it('opens a month and keeps months sorted', () => {
    const c = sample();
    setMonthDays(c, '2026-10', [1, 2]);
    setMonthDays(c, '2026-09', [3, 1, 1]);
    expect(c.attendanceMonths.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(findMonth(c, '2026-09')?.days).toEqual([1, 3]);
  });
  it('keeps the marks of days that stay when days are unticked or added', () => {
    const c = sample();
    setMonthDays(c, '2026-09', [1, 2, 3]);
    const am = findMonth(c, '2026-09')!;
    recordOf(c.students[0], am).marks = ['A', 'T', 'F'];
    setMonthDays(c, '2026-09', [1, 3, 4]);
    expect(c.students[0].attendance['2026-09'].marks).toEqual(['A', 'F', '']);
  });
});

describe('completeness', () => {
  it('is complete with a note or every day marked', () => {
    const c = sample();
    setMonthDays(c, '2026-09', [1, 2]);
    const am = findMonth(c, '2026-09')!;
    expect(isAttendanceComplete(c.students[0], am)).toBe(false);
    recordOf(c.students[0], am).marks = ['A', 'T'];
    recordOf(c.students[1], am).note = 'TRASLADO';
    expect(isAttendanceComplete(c.students[0], am)).toBe(true);
    expect(isAttendanceComplete(c.students[1], am)).toBe(true);
    expect(attendancePendingOf(c, am)).toBeNull();
  });
  it('reports incomplete students and a missing tutor', () => {
    const c = sample();
    c.tutor = ' ';
    setMonthDays(c, '2026-09', [1]);
    expect(attendancePendingOf(c, findMonth(c, '2026-09')!)).toEqual({ incompleteStudents: 2, missingTutor: true });
  });
});

describe('pendingMonths', () => {
  it('lists only the months that are not fully marked, per class', () => {
    const a = sample();
    const b = newClass('4° E - SECUNDARIA', 'Luis Prueba', [newStudent('X, Y', 3)]);
    setMonthDays(a, '2026-09', [1, 2]);
    setMonthDays(a, '2026-10', [1]);
    setMonthDays(b, '2026-09', [1]);
    for (const s of a.students) recordOf(s, findMonth(a, '2026-09')!).marks = ['A', 'T'];
    const found = pendingMonths([a, b]);
    expect(found.map((x) => [x.schoolClass.label, x.month.month, x.pending.incompleteStudents])).toEqual([
      ['5° A - SECUNDARIA', '2026-10', 2],
      ['4° E - SECUNDARIA', '2026-09', 1],
    ]);
  });
  it('is empty when every month is complete and every tutor named', () => {
    const a = sample();
    setMonthDays(a, '2026-09', [1]);
    for (const s of a.students) recordOf(s, findMonth(a, '2026-09')!).marks = ['A'];
    expect(pendingMonths([a])).toEqual([]);
  });
  it('counts a missing tutor even when all marks are filled', () => {
    const a = sample();
    a.tutor = '';
    setMonthDays(a, '2026-09', [1]);
    for (const s of a.students) recordOf(s, findMonth(a, '2026-09')!).marks = ['A'];
    expect(pendingMonths([a])[0].pending).toEqual({ incompleteStudents: 0, missingTutor: true });
  });
});
