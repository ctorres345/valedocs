import { describe, expect, it } from 'vitest';
import {
  clearQuarter,
  gradeCounts,
  isQuarterComplete,
  quarterGrade,
  quarterGrades,
  quarterStudents,
  setQuarterGrade,
  suggestedGrade,
} from '../src/domain/quarter';
import { buildQuarterSheet } from '../src/domain/quarter-layout';
import { defaultSettings, newClass, newStudent } from '../src/domain/model';
import { validateData } from '../src/storage/store';
import { buildQuarterPdf } from '../src/export/build-pdf';

/** A class whose first student has daily norms grades in June and July (rows: attendance, presentation, behaviour). */
function sample() {
  const settings = defaultSettings();
  settings.quarterMonths = ['2026-06', '2026-07'];
  const c = newClass('3° B - SECUNDARIA', '', [newStudent('PEREZ, ANA', 3), newStudent('LUNA, ROSA', 3)]);
  const s = c.students[0];
  s.norms['2026-06'] = [
    ['A', 'A', 'B'],
    ['AD', 'AD', 'AD'],
    ['B', 'B', 'C'],
  ];
  s.norms['2026-07'] = [['A'], ['AD'], ['B']];
  s.norms['2026-08'] = [['C'], ['C'], ['C']]; // not part of the quarter
  return { settings, c, s };
}

describe('quarter suggestion', () => {
  it('counts the daily grades of one criterion over the chosen months', () => {
    const { s } = sample();
    expect(gradeCounts(s, ['2026-06', '2026-07'], 0)).toEqual([0, 3, 1, 0]);
    expect(gradeCounts(s, ['2026-06', '2026-09'], 2)).toEqual([0, 0, 2, 1]);
  });
  it('suggests the rounded average grade', () => {
    expect(suggestedGrade([0, 0, 0, 0])).toBe('');
    expect(suggestedGrade([10, 25, 22, 3])).toBe('A'); // 2.7
    expect(suggestedGrade([52, 8, 0, 0])).toBe('AD'); // 3.87
    expect(suggestedGrade([1, 1, 0, 0])).toBe('AD'); // 3.5 goes up
    expect(suggestedGrade([0, 1, 3, 0])).toBe('B'); // 2.25
    expect(suggestedGrade([0, 0, 1, 5])).toBe('C');
  });
  it('prints the rows in the order of the paper form, each from its own norms criterion', () => {
    const { settings, s } = sample();
    // Presentación personal, Asistencia y puntualidad, Comportamiento
    expect(quarterGrades(s, settings)).toEqual(['AD', 'A', 'B']);
  });
});

describe('quarter grades by hand', () => {
  it('keeps her own grade, and picking the suggestion again follows the daily grades', () => {
    const { settings, s } = sample();
    setQuarterGrade(s, settings, 2, 'A');
    expect(quarterGrade(s, settings, 2)).toMatchObject({ grade: 'A', suggested: 'B', byHand: true });
    setQuarterGrade(s, settings, 2, 'B');
    expect(s.quarter.grades[2]).toBe('');
    expect(quarterGrade(s, settings, 2).byHand).toBe(false);
  });
  it('a student is complete with a grade in every row or with a special note', () => {
    const { settings, c } = sample();
    expect(isQuarterComplete(c.students[0], settings)).toBe(true);
    const other = c.students[1];
    expect(isQuarterComplete(other, settings)).toBe(false);
    setQuarterGrade(other, settings, 0, 'A');
    expect(isQuarterComplete(other, settings)).toBe(false);
    other.attendance['2026-07'] = { marks: [], note: 'TRASLADO' };
    expect(isQuarterComplete(other, settings)).toBe(true);
  });
  it('students without any grade are left out of the download', () => {
    const { settings, c } = sample();
    expect(quarterStudents(c.students, settings).map((s) => s.name)).toEqual(['PEREZ, ANA']);
  });
  it('a new quarter clears months, her own grades and observations, never the daily grades', () => {
    const { settings, c, s } = sample();
    setQuarterGrade(s, settings, 0, 'C');
    s.quarter.notes[1] = '3 tardanzas';
    clearQuarter([c], settings);
    expect(settings.quarterMonths).toEqual([]);
    expect(s.quarter).toEqual({ grades: ['', '', ''], notes: ['', '', ''] });
    expect(s.norms['2026-06']).toHaveLength(3);
  });
});

describe('quarter strip', () => {
  it('has the student, class, auxiliary, grades and observations; the blank one has none of the grades', () => {
    const { settings, c, s } = sample();
    settings.auxiliary = ' Ana Inventada ';
    s.quarter.notes[1] = ' 3 tardanzas ';
    const sheet = buildQuarterSheet(c, s, settings);
    expect(sheet).toMatchObject({ name: 'PEREZ, ANA', course: '3° B - SECUNDARIA', auxiliary: 'Ana Inventada' });
    expect(sheet.levels).toEqual(['AD', 'A', 'B', 'C']);
    expect(sheet.rows.map((r) => [r.criterion, r.grade, r.note])).toEqual([
      ['Presentación personal', 'AD', ''],
      ['Asistencia y puntualidad', 'A', '3 tardanzas'],
      ['Comportamiento', 'B', ''],
    ]);
    const blank = buildQuarterSheet(c, s, settings, true);
    expect(blank.name).toBe('PEREZ, ANA');
    expect(blank.rows.every((r) => r.grade === '' && r.note === '')).toBe(true);
  });
  it('the PDF holds three students per A4 page', () => {
    const { settings, c } = sample();
    const sheets = Array.from({ length: 7 }, () => buildQuarterSheet(c, c.students[0], settings));
    const bytes = buildQuarterPdf(sheets);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pages = (new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page\b/g) ?? []).length;
    expect(pages).toBe(3);
  });
});

describe('quarter data (version 6)', () => {
  it('upgrades version 5 data with empty quarter grades and default settings', () => {
    const { settings, c } = sample();
    const v5 = JSON.parse(JSON.stringify({ version: 5, settings, classes: [c] }));
    for (const k of ['quarterTitle', 'quarterCriteria', 'quarterMonths', 'auxiliary']) delete v5.settings[k];
    for (const s of v5.classes[0].students) delete s.quarter;
    const up = validateData(v5)!;
    expect(up.version).toBe(6);
    expect(up.settings.quarterMonths).toEqual([]);
    expect(up.settings.auxiliary).toBe('');
    expect(up.settings.quarterCriteria).toEqual(defaultSettings().quarterCriteria);
    expect(up.classes[0].students[0].quarter).toEqual({ grades: ['', '', ''], notes: ['', '', ''] });
  });
  it('cleans malformed quarter data', () => {
    const { settings, c } = sample();
    const d = JSON.parse(JSON.stringify({ version: 6, settings, classes: [c] }));
    d.settings.quarterMonths = ['2026-07', 'nope', '2026-06', '2026-07', 5];
    d.settings.quarterCriteria = [
      { name: 'Uniforme', source: 1 },
      { name: '', source: 9 },
    ];
    d.classes[0].students[0].quarter = { grades: ['A', 'X', 3], notes: ['ok', null] };
    const clean = validateData(d)!;
    expect(clean.settings.quarterMonths).toEqual(['2026-06', '2026-07']);
    expect(clean.settings.quarterCriteria).toEqual([
      { name: 'Uniforme', source: 1 },
      { name: 'Asistencia y puntualidad', source: 0 },
      { name: 'Comportamiento', source: 2 },
    ]);
    expect(clean.classes[0].students[0].quarter).toEqual({ grades: ['A', '', ''], notes: ['ok', '', ''] });
  });
});
