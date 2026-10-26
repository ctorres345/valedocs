import { describe, expect, it } from 'vitest';
import { duplicateClass, duplicateName, duplicateNames, validateNewClass } from '../src/domain/validation';
import { sameClass, newStudent, newClass, type SchoolClass } from '../src/domain/model';

const schoolClass = (id: string, label: string, names: string[] = []): SchoolClass => ({
  ...newClass(
    label,
    '',
    names.map((n) => newStudent(n, 3)),
  ),
  id,
});

describe('duplicate classes', () => {
  const classes = [schoolClass('a', '5° A - SECUNDARIA'), schoolClass('b', '4° E - SECUNDARIA')];
  it('recognises the same class written another way', () => {
    expect(sameClass('5°A', '5° A - SECUNDARIA')).toBe(true);
    expect(sameClass('5to a', '5° A - SECUNDARIA')).toBe(true);
    expect(sameClass('5° B', '5° A - SECUNDARIA')).toBe(false);
    expect(duplicateClass(classes, '5°a')?.id).toBe('a');
    expect(duplicateClass(classes, '5° B')).toBeUndefined();
  });
  it('ignores the class itself when editing', () => {
    expect(duplicateClass(classes, '5° A - SECUNDARIA', 'a')).toBeUndefined();
    expect(duplicateClass(classes, '4° E', 'a')?.id).toBe('b');
  });
});

describe('duplicate names', () => {
  it('detects duplicates despite accents, capitals or spaces', () => {
    expect(duplicateNames(['PÉREZ RUIZ, Ana', 'LUNA, Rosa', 'perez  ruiz, ana'])).toEqual(['PÉREZ RUIZ, Ana']);
    expect(duplicateNames(['A', 'B', 'C'])).toEqual([]);
    expect(duplicateNames(['', '  '])).toEqual([]);
  });
  it('ignores its own position when renaming', () => {
    const list = ['PEREZ, Ana', 'LUNA, Rosa'];
    expect(duplicateName(list, 'luna, rosa', 0)).toBe('LUNA, Rosa');
    expect(duplicateName(list, 'PEREZ, Ana', 0)).toBeUndefined();
    expect(duplicateName(list, 'NUEVO, Alumno')).toBeUndefined();
  });
});

describe('validateNewClass', () => {
  const classes = [schoolClass('a', '5° A - SECUNDARIA')];
  it('accepts a valid class', () => {
    expect(validateNewClass(classes, '5° B - SECUNDARIA', ['PEREZ, Ana', 'LUNA, Rosa'])).toEqual([]);
  });
  it('reports all problems at once', () => {
    expect(validateNewClass(classes, '', [])).toEqual([{ type: 'label-empty' }, { type: 'no-students' }]);
    expect(validateNewClass(classes, '5°A', ['X, Y', 'x, y'])).toEqual([
      { type: 'label-duplicate', other: '5° A - SECUNDARIA' },
      { type: 'duplicate-names', names: ['X, Y'] },
    ]);
  });
});
