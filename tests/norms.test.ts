import { describe, expect, it } from 'vitest';
import { deleteMonth, findMonth, setMonthDays, weekdaysOf } from '../src/domain/attendance';
import {
  gradedCount,
  isClassNormsComplete,
  isNormsComplete,
  normsOf,
  paragraphFor,
  studentsMissingGender,
} from '../src/domain/norms';
import { buildNormsReport, normsFileName } from '../src/domain/norms-layout';
import { defaultSettings, newClass, newStudent } from '../src/domain/model';

const settings = defaultSettings();
const sample = () => {
  const c = newClass('5° A - SECUNDARIA', 'Ana Prueba', [newStudent('PEREZ, ANA', 3), newStudent('LUNA, ROSA', 3)]);
  setMonthDays(c, '2026-09', [1, 2, 3]);
  return c;
};

describe('norms grades', () => {
  it('creates a grid of criteria × school days and counts graded boxes', () => {
    const c = sample();
    const am = findMonth(c, '2026-09')!;
    const rows = normsOf(c.students[0], am, 3);
    expect(rows).toEqual([
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ]);
    expect(isNormsComplete(c.students[0], am, 3)).toBe(false);
    rows[0][0] = 'A';
    expect(gradedCount(c.students[0], '2026-09')).toBe(1);
    for (const r of rows) r.fill('B');
    expect(isNormsComplete(c.students[0], am, 3)).toBe(true);
  });
  it('a class is complete only with a month and everyone graded', () => {
    const c = sample();
    const am = findMonth(c, '2026-09')!;
    expect(isClassNormsComplete(c, settings)).toBe(false);
    for (const s of c.students) for (const r of normsOf(s, am, 3)) r.fill('A');
    expect(isClassNormsComplete(c, settings)).toBe(true);
    expect(isClassNormsComplete(newClass('x', '', []), settings)).toBe(false);
  });
  it('keeps the grades of the days that stay when the school days change', () => {
    const c = sample();
    const am = findMonth(c, '2026-09')!;
    const rows = normsOf(c.students[0], am, 3);
    rows[0] = ['A', 'B', 'C'];
    rows[2] = ['AD', 'AD', 'AD'];
    setMonthDays(c, '2026-09', [1, 3, 4]);
    expect(c.students[0].norms['2026-09']).toEqual([
      ['A', 'C', ''],
      ['', '', ''],
      ['AD', 'AD', ''],
    ]);
  });
  it('deleting a month removes attendance and norms of that month only', () => {
    const c = sample();
    setMonthDays(c, '2026-10', [1]);
    const s = c.students[0];
    s.attendance['2026-09'] = { marks: ['A', 'A', 'A'], note: '' };
    normsOf(s, findMonth(c, '2026-09')!, 3);
    normsOf(s, findMonth(c, '2026-10')!, 3);
    deleteMonth(c, '2026-09');
    expect(c.attendanceMonths.map((m) => m.month)).toEqual(['2026-10']);
    expect(s.attendance['2026-09']).toBeUndefined();
    expect(s.norms['2026-09']).toBeUndefined();
    expect(s.norms['2026-10']).toBeDefined();
  });
  it('gives the paragraph of the grade from the settings, empty without grade', () => {
    expect(paragraphFor(settings, 0, 'AD')).toContain('puntualmente todos los días');
    expect(paragraphFor(settings, 2, 'C')).toContain('No evidencia mejora');
    expect(paragraphFor(settings, 1, '')).toBe('');
    expect(paragraphFor(settings, 1, 'Z')).toBe('');
    const custom = {
      ...settings,
      normsCriteria: settings.normsCriteria.map((c) => ({ ...c, texts: ['t1', 't2', 't3', 't4'] })),
    };
    expect(paragraphFor(custom, 1, 'B')).toBe('t3');
  });
  it('default paragraphs have no known typos', () => {
    const all = settings.normsCriteria.flatMap((c) => c.texts).join(' ');
    for (const typo of ['Efucativa', 'permantemente', 'personall', 'alajas', 'todo los dias'])
      expect(all).not.toContain(typo);
  });
});

describe('norms report layout', () => {
  const july = () => {
    const c = newClass('5° A - SECUNDARIA', 'Ana Prueba', [newStudent('PEREZ, ANA', 3), newStudent('LUNA, ROSA', 3)]);
    // July 2026 starts on a Wednesday; the 7th is a holiday and the week of the 27th has no school
    const days = weekdaysOf('2026-07').filter((d) => d !== 7 && d < 27);
    setMonthDays(c, '2026-07', days);
    return { c, am: findMonth(c, '2026-07')! };
  };
  it('splits the month in Monday-Friday weeks like the template', () => {
    const { c, am } = july();
    const r = buildNormsReport(c, c.students[0], settings, am);
    expect(r.weeks).toHaveLength(4);
    expect(r.weeks[0].map((d) => d.header)).toEqual(['Lunes', 'Martes', 'Miércoles 1', 'Jueves 2', 'Viernes 3']);
    expect(r.weeks[1][0].header).toBe('Lunes 6');
    expect(r.month).toBe('Julio');
    expect(r.criteria).toEqual(['Asistencia y Puntualidad', 'Presentación personal e higiene', 'Comportamiento']);
  });
  it('marks unticked weekdays as holidays and leaves out weeks without school', () => {
    const { c, am } = july();
    const r = buildNormsReport(c, c.students[0], settings, am);
    expect(r.weeks[1][1]).toMatchObject({ header: 'Martes 7', holiday: true });
    expect(r.weeks[0][0].holiday).toBe(false); // outside the month: only the weekday name
    expect(r.weeks.flat().some((d) => d.header.endsWith('27'))).toBe(false);
  });
  it('prints the paragraph of each grade, empty for ungraded boxes', () => {
    const { c, am } = july();
    const rows = normsOf(c.students[0], am, 3);
    const k = am.days.indexOf(1);
    rows[0][k] = 'AD';
    rows[2][k] = 'C';
    const day = buildNormsReport(c, c.students[0], settings, am).weeks[0][2];
    expect(day.texts[0]).toBe(settings.normsCriteria[0].texts[0]);
    expect(day.texts[1]).toBe('');
    expect(day.texts[2]).toBe(settings.normsCriteria[2].texts[3]);
  });
  it('names files by class, student number and month', () => {
    const { c, am } = july();
    expect(normsFileName(c, am, null)).toBe('5°A - Normas Julio 2026');
    expect(normsFileName(c, am, c.students[1])).toBe('5°A - 02 LUNA, ROSA - Julio 2026');
  });
});

describe('stored norms grades', () => {
  it('drops grades that are not AD, A, B or C', async () => {
    const { validateData } = await import('../src/storage/store');
    const c = newClass('5° A', 'X', [newStudent('PEREZ, ANA', 3)]);
    setMonthDays(c, '2026-09', [1, 2]);
    c.students[0].norms['2026-09'] = [
      ['A', 'x'],
      ['a', 'AD'],
      ['', 'C'],
    ];
    const clean = validateData({ version: 5, settings: defaultSettings(), classes: [c] })!;
    expect(clean.classes[0].students[0].norms['2026-09']).toEqual([
      ['A', ''],
      ['', 'AD'],
      ['', 'C'],
    ]);
  });
});

describe('gender wording', () => {
  it('uses the feminine paragraph for M and the masculine one for H or not chosen', () => {
    expect(paragraphFor(settings, 0, 'AD', 'M')).toContain('La estudiante asiste puntualmente');
    expect(paragraphFor(settings, 0, 'AD', 'H')).toContain('El estudiante asiste puntualmente');
    expect(paragraphFor(settings, 0, 'AD')).toBe(paragraphFor(settings, 0, 'AD', 'H'));
  });
  it('lists only the students who will be exported and have no gender', () => {
    const c = newClass('5° A', 'X', [newStudent('A, A', 3, 'H'), newStudent('B, B', 3), newStudent('C, C', 3)]);
    setMonthDays(c, '2026-09', [1]);
    const am = findMonth(c, '2026-09')!;
    normsOf(c.students[0], am, 3)[0][0] = 'A';
    normsOf(c.students[1], am, 3)[0][0] = 'A';
    expect(studentsMissingGender(c, '2026-09').map((s) => s.name)).toEqual(['B, B']);
  });
  it('the report of a girl prints the feminine text', () => {
    const c = newClass('5° A', 'X', [newStudent('A, A', 3, 'M')]);
    setMonthDays(c, '2026-09', [1]);
    const am = findMonth(c, '2026-09')!;
    normsOf(c.students[0], am, 3)[0][0] = 'AD';
    const day = buildNormsReport(c, c.students[0], settings, am).weeks[0].find((d) => d.header.endsWith(' 1'))!;
    expect(day.texts[0]).toContain('La estudiante');
  });
});

describe('students with a special note', () => {
  it('count as complete in norms: there is nothing to grade', () => {
    const c = newClass('5° A', 'X', [newStudent('A, A', 3), newStudent('B, B', 3), newStudent('C, C', 3)]);
    setMonthDays(c, '2026-09', [1, 2]);
    const am = findMonth(c, '2026-09')!;
    c.students[0].note = 'TRASLADO AL EXTRANJERO';
    c.students[1].attendance['2026-09'] = { marks: ['', ''], note: 'RETIRADO' };
    expect(c.students.map((s) => isNormsComplete(s, am, 3))).toEqual([true, true, false]);
  });
});
