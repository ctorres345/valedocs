import { describe, expect, it, vi } from 'vitest';
import {
  getData,
  mergeStudents,
  readBackup,
  removeClassById,
  replaceAll,
  resetAll,
  validateData,
} from '../src/storage/store';
import {
  formatTutor,
  pendingOf,
  parseTutor,
  defaultSettings,
  isStudentComplete,
  shortName,
  newStudent,
  progress,
  type AppData,
} from '../src/domain/model';

function example(): AppData {
  const n = defaultSettings().columns.length;
  const a = newStudent('PEREZ RUIZ, ANA', n);
  a.grades = ['A', 'AD', 'B'];
  const b = newStudent('LUNA DIAZ, ROSA', n);
  b.note = 'TRASLADO';
  return {
    version: 6,
    settings: defaultSettings(),
    classes: [
      {
        id: 'c1',
        label: '5° A - SECUNDARIA',
        tutor: 'X',
        students: [a, b, newStudent('SOTO, LUIS', n)],
        attendanceMonths: [],
      },
    ],
  };
}

describe('backup', () => {
  it('downloading and restoring returns exactly the same data', () => {
    const original = example();
    const restored = readBackup(JSON.stringify({ ...original, logos: null }, null, 1));
    expect(restored?.data).toEqual(original);
    expect(restored?.logos).toBeNull();
  });
  it('rejects files that are not a valid backup', () => {
    expect(readBackup('esto no es json')).toBeNull();
    expect(readBackup('{"version":2}')).toBeNull();
    expect(readBackup('{"version":1,"ajustes":{"columnas":[],"notasPermitidas":[]},"clases":[]}')).toBeNull();
    expect(validateData(null)).toBeNull();
  });
  it('upgrades a version 1 backup without losing grades and keeps attendance when present', () => {
    const v1 = JSON.parse(JSON.stringify(example()));
    v1.version = 1;
    delete v1.settings.uniformNote;
    delete v1.classes[0].attendanceMonths;
    for (const s of v1.classes[0].students) delete s.attendance;
    const up = readBackup(JSON.stringify(v1))?.data;
    expect(up?.version).toBe(6);
    expect(up?.settings.uniformNote).toBe('');
    expect(up?.classes[0].attendanceMonths).toEqual([]);
    expect(up?.classes[0].students[0].grades).toEqual(['A', 'AD', 'B']);
    expect(up?.classes[0].students[0].attendance).toEqual({});

    const v2 = example();
    v2.classes[0].attendanceMonths = [{ month: '2026-09', days: [1, 2] }];
    v2.classes[0].students[0].attendance['2026-09'] = { marks: ['A', 'T'], note: '' };
    expect(readBackup(JSON.stringify(v2))?.data).toEqual(v2);
  });
  it('drops malformed attendance data instead of crashing later', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.classes[0].attendanceMonths = [
      { month: '2026-09', days: [2, 1, 1, 40, 'x'] },
      { month: 'bad', days: [1] },
      { month: '2026-10' },
      null,
    ];
    d.classes[0].students[0].attendance = { '2026-09': { marks: 'AAA' }, '2026-10': { marks: ['A'] }, other: 5 };
    d.classes[0].students[1].attendance = { '2026-09': { marks: ['A', 7, 'T'], note: 3 } };
    const ok = validateData(d)!;
    expect(ok.classes[0].attendanceMonths).toEqual([{ month: '2026-09', days: [1, 2] }]);
    expect(ok.classes[0].students[0].attendance).toEqual({});
    expect(ok.classes[0].students[1].attendance).toEqual({ '2026-09': { marks: ['A', ''], note: '' } });
  });
  it('keeps attendance when a name list is re-imported', () => {
    const a = newStudent('PEREZ RUIZ, ANA', 3);
    a.attendance['2026-09'] = { marks: ['A'], note: '' };
    const merged = mergeStudents([a], ['PEREZ RUIZ, ANA', 'NUEVA, EVA'], 3);
    expect(merged[0].attendance['2026-09'].marks).toEqual(['A']);
    expect(merged[1].attendance).toEqual({});
  });
  it('fills in fields missing in old backups and fits grades to the columns', () => {
    const d = JSON.parse(JSON.stringify(example()));
    delete d.classes[0].tutor;
    delete d.classes[0].students[0].note;
    d.classes[0].students[0].grades = ['A'];
    const v = validateData(d)!;
    expect(v.classes[0].tutor).toBe('');
    expect(v.classes[0].students[0].note).toBe('');
    expect(v.classes[0].students[0].grades).toEqual(['A', '', '']);
  });
});

describe('mergeStudents', () => {
  it('keeps the grades of existing students even if accents or spaces change', () => {
    const { classes } = example();
    const newNames = mergeStudents(classes[0].students, ['SOTO, LUIS', 'PÉREZ  RUIZ, ANA', 'NUEVO, ALUMNO'], 3);
    expect(newNames.map((a) => a.name)).toEqual(['SOTO, LUIS', 'PÉREZ  RUIZ, ANA', 'NUEVO, ALUMNO']);
    expect(newNames[1].grades).toEqual(['A', 'AD', 'B']);
    expect(newNames[2].grades).toEqual(['', '', '']);
  });
});

describe('model', () => {
  it('counts complete students (all grades filled, or a special note)', () => {
    const { classes } = example();
    expect(classes[0].students.map(isStudentComplete)).toEqual([true, true, false]);
    expect(progress(classes[0])).toEqual({ doneCount: 2, total: 3 });
  });
  it('gives sheets short names', () => {
    expect(shortName('5° A - SECUNDARIA')).toBe('5°A');
    expect(shortName('4to B - SECUNDARIA')).toBe('4°B');
  });
});

describe('deleting data', () => {
  it('removes a single class and keeps the others', () => {
    const data = example();
    data.classes.push({ ...data.classes[0], id: 'c2', label: '4° E - SECUNDARIA' });
    replaceAll(data);
    removeClassById('c1');
    expect(getData().classes.map((c) => c.id)).toEqual(['c2']);
  });

  it('starts from scratch: no classes and default settings', async () => {
    const data = example();
    data.settings.term = 'III TRIMESTRE - 2030';
    replaceAll(data);
    await resetAll();
    expect(getData().classes).toEqual([]);
    expect(getData().settings.term).toBe(defaultSettings().term);
  });
});

describe('tutor line', () => {
  it('adds the prefix and capitals itself, like her template', () => {
    expect(formatTutor({ tutor: 'Rosa Prueba' })).toBe('TUTOR: ROSA PRUEBA');
    expect(formatTutor({ tutor: ' luis   ejemplo ' })).toBe('TUTOR: LUIS EJEMPLO');
    expect(formatTutor({ tutor: '  ' })).toBe('');
  });

  it('does not duplicate a prefix she typed herself', () => {
    expect(parseTutor('TUTORA: Rosa Prueba')).toBe('Rosa Prueba');
    expect(parseTutor('tutor : Luis Ejemplo')).toBe('Luis Ejemplo');
    expect(parseTutor('Rosa Prueba')).toBe('Rosa Prueba');
    expect(formatTutor({ tutor: 'TUTORA: Rosa Prueba' })).toBe('TUTOR: ROSA PRUEBA');
  });

  it('cleans stored classes whose tutor already contains a prefix', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.classes[0].tutor = 'TUTOR: Marco Prueba';
    expect(validateData(d)!.classes[0].tutor).toBe('Marco Prueba');
  });
});

describe('pending work in a class', () => {
  it('reports nothing when grades and tutor are complete', () => {
    const c = example().classes[0];
    c.tutor = 'Ana';
    c.students.forEach((s) => (s.grades = ['A', 'A', 'B']));
    expect(pendingOf(c)).toBeNull();
  });

  it('counts incomplete students and flags a missing tutor', () => {
    const c = example().classes[0];
    c.tutor = '  ';
    c.students.forEach((s) => (s.grades = ['A', 'A', 'B']));
    c.students[0].grades = ['A', '', 'B'];
    expect(pendingOf(c)).toEqual({ incompleteStudents: 1, missingTutor: true });
  });

  it('treats a special note as complete', () => {
    const c = example().classes[0];
    c.tutor = 'Ana';
    c.students.forEach((s) => (s.note = 'TRASLADO'));
    expect(pendingOf(c)).toBeNull();
  });
});

describe('norms data (version 3)', () => {
  it('upgrades a version 2 backup with default norms settings and empty grades', () => {
    const v2 = JSON.parse(JSON.stringify(example()));
    v2.version = 2;
    delete v2.settings.normsTitle;
    delete v2.settings.normsCriteria;
    for (const s of v2.classes[0].students) delete s.norms;
    const up = readBackup(JSON.stringify(v2))!.data;
    expect(up.version).toBe(6);
    expect(up.settings.normsCriteria).toEqual(defaultSettings().normsCriteria);
    expect(up.settings.normsTitle).toBe(defaultSettings().normsTitle);
    expect(up.classes[0].students[0].norms).toEqual({});
  });
  it('keeps edited paragraphs, falls back to the default for malformed ones', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.settings.normsCriteria = [{ name: 'Puntualidad', texts: ['uno', 5] }, null];
    const c = validateData(d)!.settings.normsCriteria;
    const def = defaultSettings().normsCriteria;
    expect(c).toHaveLength(3);
    expect(c[0].name).toBe('Puntualidad');
    expect(c[0].texts).toEqual(['uno', def[0].texts[1], def[0].texts[2], def[0].texts[3]]);
    expect(c[1]).toEqual(def[1]);
  });
  it('fits norms grades to the month days and drops unknown months and malformed rows', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.classes[0].attendanceMonths = [{ month: '2026-09', days: [1, 2, 3] }];
    d.classes[0].students[0].norms = {
      '2026-09': [['A', 'B'], 'x', [1, 'C', 'AD', 'B']],
      '2026-10': [['A']],
    };
    expect(validateData(d)!.classes[0].students[0].norms).toEqual({
      '2026-09': [
        ['A', 'B', ''],
        ['', '', ''],
        ['', 'C', 'AD'],
      ],
    });
  });
  it('keeps norms when a name list is re-imported', () => {
    const a = newStudent('PEREZ RUIZ, ANA', 3);
    a.norms['2026-09'] = [['A'], ['B'], ['C']];
    const merged = mergeStudents([a], ['PEREZ RUIZ, ANA'], 3);
    expect(merged[0].norms['2026-09']).toEqual([['A'], ['B'], ['C']]);
  });
  it('creates students with the norms field in the backup round trip', () => {
    const original = example();
    original.classes[0].attendanceMonths = [{ month: '2026-09', days: [1, 2] }];
    original.classes[0].students[0].norms['2026-09'] = [
      ['A', 'B'],
      ['AD', ''],
      ['C', 'C'],
    ];
    expect(readBackup(JSON.stringify(original))?.data).toEqual(original);
  });
});

describe('unreadable stored data', () => {
  async function loadWith(saved: unknown) {
    vi.resetModules();
    const sets: unknown[] = [];
    vi.doMock('idb-keyval', () => ({
      get: async () => saved,
      set: async (_k: string, v: unknown) => void sets.push(v),
    }));
    const store = await import('../src/storage/store');
    await store.load();
    return { store, sets };
  }
  it('keeps data from a newer version untouched: nothing is saved over it', async () => {
    vi.useFakeTimers();
    const { store, sets } = await loadWith({ version: 99, settings: {}, classes: [] });
    expect(store.storedDataUnreadable()).toBe(true);
    store.change((d) => (d.settings.term = 'X'));
    await store.flushSave();
    vi.runAllTimers();
    expect(sets).toEqual([]);
    vi.useRealTimers();
  });
  it('tells her once, on any screen, that changes are not being saved', async () => {
    const { store } = await loadWith({ version: 99 });
    const codes: string[] = [];
    store.onNotice((c) => codes.push(c));
    store.change((d) => (d.settings.term = 'X'));
    store.change((d) => (d.settings.term = 'Y'));
    expect(codes).toEqual(['locked']);
  });
  it('lets her replace everything on purpose (restore or start from scratch)', async () => {
    const { store, sets } = await loadWith({ version: 99 });
    await store.resetAll();
    await store.flushSave();
    expect(store.storedDataUnreadable()).toBe(false);
    expect(sets.length).toBeGreaterThan(0);
  });
  it('first run (nothing stored) saves normally', async () => {
    const { store, sets } = await loadWith(undefined);
    expect(store.storedDataUnreadable()).toBe(false);
    store.change((d) => (d.settings.term = 'X'));
    await store.flushSave();
    expect(sets).toHaveLength(1);
  });
});

describe('student gender (version 4) and workshop (version 5)', () => {
  it('upgrades older backups with no gender chosen and cleans bad values', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.version = 3;
    delete d.classes[0].students[0].gender;
    d.classes[0].students[1].gender = 'X';
    d.classes[0].students[2].gender = 'M';
    for (const c of d.settings.normsCriteria) delete c.textsFemale;
    const up = validateData(d)!;
    expect(up.version).toBe(6);
    expect(up.classes[0].students.map((s) => s.gender)).toEqual(['', '', 'M']);
    expect(up.settings.normsCriteria[0].textsFemale).toEqual(defaultSettings().normsCriteria[0].textsFemale);
  });
  it('upgrades older data with no workshop and cleans unknown codes', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.version = 4;
    delete d.classes[0].students[0].workshop;
    d.classes[0].students[1].workshop = 'DANZA';
    d.classes[0].students[2].workshop = 'ELEC';
    const up = validateData(d)!;
    expect(up.classes[0].students.map((s) => s.workshop)).toEqual(['', '', 'ELEC']);
  });
  it('keeps the workshop she chose when the list is re-imported, and fills empty ones from the file', () => {
    const a = newStudent('PEREZ RUIZ, ANA', 3, '', 'COMP');
    const b = newStudent('LUNA, ROSA', 3);
    const names = ['PEREZ RUIZ, ANA', 'LUNA, ROSA', 'NUEVO, LUIS'];
    const merged = mergeStudents([a, b], names, 3, [], ['ELEC', 'CARP', 'IND']);
    expect(merged.map((s) => s.workshop)).toEqual(['COMP', 'CARP', 'IND']);
  });
  it('keeps the gender she chose when the list is re-imported, and fills empty ones from the file', () => {
    const a = newStudent('PEREZ RUIZ, ANA', 3, 'M');
    const b = newStudent('LUNA, ROSA', 3);
    const merged = mergeStudents([a, b], ['PEREZ RUIZ, ANA', 'LUNA, ROSA', 'NUEVO, LUIS'], 3, ['H', 'M', 'H']);
    expect(merged.map((s) => s.gender)).toEqual(['M', 'M', 'H']);
  });
});

describe('months in stored data', () => {
  it('keeps one entry per month and drops months without school days', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.classes[0].attendanceMonths = [
      { month: '2026-09', days: [1, 2] },
      { month: '2026-09', days: [5] },
      { month: '2026-10', days: [] },
    ];
    expect(validateData(d)!.classes[0].attendanceMonths).toEqual([{ month: '2026-09', days: [1, 2] }]);
  });
});

describe('real school days', () => {
  it('drops days that are weekends or do not exist in the month', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.classes[0].attendanceMonths = [{ month: '2026-02', days: [2, 7, 8, 31] }]; // 7 and 8 are weekend days
    expect(validateData(d)!.classes[0].attendanceMonths).toEqual([{ month: '2026-02', days: [2] }]);
  });
});

describe('storage that cannot be read', () => {
  it('locks saving when reading throws, so the next autosave does not replace the real data', async () => {
    vi.resetModules();
    const sets: unknown[] = [];
    vi.doMock('idb-keyval', () => ({
      get: async () => {
        throw new Error('blocked');
      },
      set: async (_k: string, v: unknown) => void sets.push(v),
    }));
    const store = await import('../src/storage/store');
    await store.load();
    expect(store.storedDataUnreadable()).toBe(true);
    store.change((d) => (d.settings.term = 'X'));
    await store.flushSave();
    expect(sets).toEqual([]);
  });
});

describe('backup while stored data is invalid', () => {
  it('is refused only when stored data exists but could not be read, not when reading failed', async () => {
    vi.resetModules();
    vi.doMock('idb-keyval', () => ({ get: async () => ({ version: 99 }), set: async () => {} }));
    const invalid = await import('../src/storage/store');
    await invalid.load();
    expect(invalid.backupWouldBeEmpty()).toBe(true);
    vi.resetModules();
    vi.doMock('idb-keyval', () => ({
      get: async () => {
        throw new Error('blocked');
      },
      set: async () => {},
    }));
    const failed = await import('../src/storage/store');
    await failed.load();
    expect(failed.backupWouldBeEmpty()).toBe(false);
  });
  it('sorts months oldest first when loading', () => {
    const d = JSON.parse(JSON.stringify(example()));
    d.classes[0].attendanceMonths = [
      { month: '2026-10', days: [1] },
      { month: '2026-09', days: [1] },
    ];
    expect(validateData(d)!.classes[0].attendanceMonths.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
  });
});

describe('school pack', () => {
  // Earlier tests reset the modules, so the store is imported afresh here
  it('holds the settings and logos but no class, and keeps the classes when loaded', async () => {
    const store = await import('../src/storage/store');
    const { setLogos, customLogos } = await import('../src/storage/logos');
    const logo = { uri: 'data:image/png;base64,iVBORw0KGgo=', width: 10, height: 10 };
    await setLogos({ left: logo, right: null });
    const data = example();
    data.settings.institution2 = 'COLEGIO DE PRUEBA';
    data.settings.auxiliary = 'Nombre Inventado';
    data.settings.quarterMonths = ['2026-06'];
    store.replaceAll(data);
    const text = store.createSchoolPack();
    expect(text).not.toContain('PEREZ RUIZ');
    // Her own name and her quarter stay on her device
    expect(text).not.toContain('Nombre Inventado');
    expect(text).not.toContain('2026-06');
    const pack = store.readSchoolPack(text)!;
    expect(pack.settings.institution2).toBe('COLEGIO DE PRUEBA');
    expect(pack.logos).toEqual({ left: logo, right: null });

    // Another device: other settings, its own classes
    await setLogos({ left: null, right: null });
    const other = example();
    other.settings.institution2 = 'OTRO';
    other.settings.auxiliary = 'Otra Persona';
    other.settings.quarterMonths = ['2026-09'];
    store.replaceAll(other);
    await store.applySchoolPack(pack);
    expect(store.getData().settings.institution2).toBe('COLEGIO DE PRUEBA');
    expect(store.getData().settings.auxiliary).toBe('Otra Persona');
    expect(store.getData().settings.quarterMonths).toEqual(['2026-09']);
    expect(store.getData().classes).toHaveLength(1);
    expect(customLogos()).toEqual({ left: logo, right: null });
  });

  it('rejects backups and other files', async () => {
    const store = await import('../src/storage/store');
    expect(store.readSchoolPack(store.createBackup())).toBeNull();
    expect(store.readSchoolPack('{"kind":"valedocs-school-pack"}')).toBeNull();
    expect(store.readSchoolPack('nope')).toBeNull();
  });
});
