import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { readNames } from '../src/import/read-names';
import { teacherWorkbook } from './fixtures';

describe('readNames (test workbook)', () => {
  const workbook = teacherWorkbook([
    {
      name: '4ºA',
      label: '4to A - SECUNDARIA',
      students: ['PEREZ RUIZ, ANA', 'GOMEZ  LEON, LUIS', 'SOTO & HIJOS, MARIA'],
      shapes: 50,
    },
    { name: '4°E', label: '4to E - SECUNDARIA', students: ['LUNA DIAZ, ROSA'] },
  ]);
  const classes = readNames(workbook);

  it('finds every sheet with its label', () => {
    expect(classes.map((c) => c.label)).toEqual(['4° A - SECUNDARIA', '4° E - SECUNDARIA']);
  });
  it('reads only the students, not the blocks below', () => {
    expect(classes[0].names).toEqual(['PEREZ RUIZ, ANA', 'GOMEZ LEON, LUIS', 'SOTO & HIJOS, MARIA']);
    expect(classes[1].names).toEqual(['LUNA DIAZ, ROSA']);
  });
  it('has empty genders when the sheet has no gender column', () => {
    expect(classes[0].genders).toEqual(['', '', '']);
  });
  it('rejects files that are not Excel', () => {
    expect(() => readNames(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

// Real files are never committed: point these variables at them locally (the tests are skipped otherwise)
const REAL_TEACHER_FILE = process.env.VALEDOCS_TEACHER_FILE ?? '';
const REAL_OWN_FILE = process.env.VALEDOCS_OWN_FILE ?? '';

describe.skipIf(REAL_TEACHER_FILE === '' || !existsSync(REAL_TEACHER_FILE))('real teacher file', () => {
  it('lists the 5 sections with the expected number of students', () => {
    const t0 = Date.now();
    const classes = readNames(new Uint8Array(readFileSync(REAL_TEACHER_FILE)));
    const ms = Date.now() - t0;
    console.log('docente:', classes.map((c) => `${c.sheet}→${c.label} (${c.names.length})`).join(' | '), `${ms} ms`);
    expect(classes).toHaveLength(5);
    expect(classes[0].names).toHaveLength(29);
    expect(classes[4].names).toHaveLength(31);
    expect(ms).toBeLessThan(10000);
  });
});

describe.skipIf(REAL_OWN_FILE === '' || !existsSync(REAL_OWN_FILE))('real own report file', () => {
  it('also reads her own format (with a sex column)', () => {
    const classes = readNames(new Uint8Array(readFileSync(REAL_OWN_FILE)));
    console.log('own file:', classes.map((c) => `${c.sheet}→${c.label} (${c.names.length})`).join(' | '));
    expect(classes).toHaveLength(6);
    expect(classes[0].names).toHaveLength(29);
    expect(classes[5].names).toHaveLength(31);
  });
});

describe('gender column', () => {
  const read = (extra: object) =>
    readNames(
      teacherWorkbook([
        { name: '4A', label: '4to A - SECUNDARIA', students: ['A, A', 'B, B', 'C, C', 'D, D'], ...extra },
      ]),
    )[0].genders;
  it('reads H and M from a column titled S', () => {
    expect(read({ genders: ['H', 'M', 'm ', 'x'] })).toEqual(['H', 'M', 'M', '']);
  });
  it('also accepts Sexo and Género, and a header on the second header row', () => {
    expect(read({ genders: ['H', 'M', 'Hombre', 'Mujer'], genderHeader: 'Sexo' })).toEqual(['H', 'M', 'H', 'M']);
    expect(read({ genders: ['H', 'M'], genderHeader: 'GÉNERO', genderHeaderRow: 10 })).toEqual(['H', 'M', '', '']);
  });
  it('leaves it empty for other values and other column titles', () => {
    expect(read({ genders: ['x', '1', 'Otro', 'H'] })).toEqual(['', '', '', 'H']);
    expect(read({ genders: ['H', 'M'], genderHeader: 'TALLER' })).toEqual(['', '', '', '']);
  });
});

describe('workshop column', () => {
  const read = (extra: object) =>
    readNames(
      teacherWorkbook([
        { name: '4A', label: '4to A - SECUNDARIA', students: ['A, A', 'B, B', 'C, C', 'D, D'], ...extra },
      ]),
    )[0].workshops;
  it('reads codes and full names from a column titled TALLER, and leaves unknown values empty', () => {
    expect(read({ workshops: ['CARP', 'Computación', 'Electricidad', 'Danza'] })).toEqual(['CARP', 'COMP', 'ELEC', '']);
  });
  it('leaves empty a workshop the grade does not offer', () => {
    expect(read({ workshops: ['IND', 'CARP', 'COMP', 'CONF'] })).toEqual(['', 'CARP', 'COMP', 'CONF']);
    const first = readNames(
      teacherWorkbook([
        {
          name: '1A',
          label: '1ro A - SECUNDARIA',
          students: ['A, A', 'B, B'],
          workshops: ['industria alimentaria', 'CARP'],
        },
      ]),
    )[0].workshops;
    expect(first).toEqual(['IND', '']);
  });
  it('is empty when the sheet has no TALLER column', () => {
    expect(read({})).toEqual(['', '', '', '']);
  });
});

describe('gender column header scan', () => {
  it('does not read a stray "S" in a student row as the header', () => {
    const wb = teacherWorkbook([
      {
        name: '4A',
        label: '4to A - SECUNDARIA',
        students: ['A, A', 'B, B'],
        genders: ['S', 'M'],
        genderHeaderRow: 10,
        genderHeader: 'X',
      },
    ]);
    // Header "X" is not a gender header, so the "S" in the first student row must not count either
    expect(readNames(wb)[0].genders).toEqual(['', '']);
  });
});

describe('other gender conventions', () => {
  it('ignores a column that uses F/V or Masculino/Femenino instead of guessing', () => {
    const read = (genders: string[]) =>
      readNames(teacherWorkbook([{ name: '4A', label: '4to A - SECUNDARIA', students: ['A, A', 'B, B'], genders }]))[0]
        .genders;
    expect(read(['M', 'F'])).toEqual(['', '']);
    expect(read(['Masculino', 'Femenino'])).toEqual(['', '']);
    expect(read(['H', 'M'])).toEqual(['H', 'M']);
  });
});
