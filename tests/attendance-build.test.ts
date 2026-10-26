import { beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildAttendanceWorkbook } from '../src/export/build-xlsx';
import { buildAttendancePdf } from '../src/export/build-pdf';
import {
  findMonth,
  recordOf,
  setMonthDays,
  studentsMissingWorkshop,
  studentsMissingWorkshopAnyMonth,
} from '../src/domain/attendance';
import { buildAttendanceReport, incompleteAttendanceRows } from '../src/domain/attendance-layout';
import { classYear, defaultSettings, newClass, newStudent, workshopsFor } from '../src/domain/model';
import { setLogos } from '../src/storage/logos';

const settings = { ...defaultSettings(), uniformNote: 'BUZO: LUNES Y JUEVES' };

function classWithMonth() {
  const c = newClass('5° A - SECUNDARIA', 'ana prueba', [
    newStudent('PEREZ RUIZ, ANA', 3, '', 'CARP'),
    newStudent('LUNA DIAZ, ROSA', 3),
    newStudent('SOTO, LUIS', 3, '', 'COMP'),
  ]);
  setMonthDays(c, '2026-09', [1, 2, 3, 4]);
  const am = findMonth(c, '2026-09')!;
  recordOf(c.students[0], am).marks = ['A', 'T', 'F', 'T'];
  recordOf(c.students[1], am).note = 'TRASLADO';
  recordOf(c.students[2], am).marks = ['A', 'J', '', 'A'];
  return { c, am };
}

describe('attendance layout', () => {
  it('builds rows with summaries and flags unmarked days', () => {
    const { c, am } = classWithMonth();
    const r = buildAttendanceReport(c, settings, am, false);
    expect(r.title).toBe('MES DE SETIEMBRE DEL 2026');
    expect(r.tutor).toBe('TUTOR: ANA PRUEBA');
    expect(r.rows.map((f) => f.summary)).toEqual(['2T  1F', '', '1J']);
    expect(incompleteAttendanceRows(r).map((f) => f.name)).toEqual(['SOTO, LUIS']);
  });
  it('building a report does not create records on the students', () => {
    const { c, am } = classWithMonth();
    const lone = newClass('4° E - SECUNDARIA', 'Luis', [newStudent('X, Y', 3)]);
    setMonthDays(lone, '2026-09', [1, 2]);
    const r = buildAttendanceReport(lone, settings, findMonth(lone, '2026-09')!, false);
    expect(r.rows[0].marks).toEqual(['', '']);
    expect(lone.students[0].attendance).toEqual({});
    expect(buildAttendanceReport(c, settings, am, false).rows).toHaveLength(3);
  });
  it('blank report has empty marks', () => {
    const { c, am } = classWithMonth();
    const r = buildAttendanceReport(c, settings, am, true);
    expect(r.rows.every((f) => f.note === '' && f.summary === '' && f.marks.every((m) => m === ''))).toBe(true);
  });
});

describe('workshops', () => {
  it('offers IND to 1st-2nd grade, CARP to 3rd-5th, and everything when the label has no year', () => {
    expect(classYear('2° B - SECUNDARIA')).toBe(2);
    expect(workshopsFor('1° A - SECUNDARIA')).toEqual(['IND', 'CONF', 'COMP', 'ELEC']);
    expect(workshopsFor('2° B - SECUNDARIA')).toContain('IND');
    expect(workshopsFor('3° A - SECUNDARIA')).toEqual(['CARP', 'COMP', 'CONF', 'ELEC']);
    expect(workshopsFor('5° C - SECUNDARIA')).not.toContain('IND');
    expect(workshopsFor('Taller')).toEqual(['IND', 'CARP', 'COMP', 'CONF', 'ELEC']);
  });
  it('flags students without a workshop unless they have a special note', () => {
    const { c, am } = classWithMonth();
    expect(studentsMissingWorkshop(c, am)).toEqual([]);
    c.students[0].workshop = '';
    expect(studentsMissingWorkshop(c, am).map((s) => s.name)).toEqual(['PEREZ RUIZ, ANA']);
    c.students[0].note = 'TRASLADO AL EXTRANJERO';
    expect(studentsMissingWorkshop(c, am)).toEqual([]);
  });
  it('lists a student missing a workshop in any opened month once, and none when there are no months', () => {
    const { c } = classWithMonth();
    c.students[0].workshop = '';
    setMonthDays(c, '2026-10', [1, 2]);
    // Rosa has a note only in September, so she is missing in October
    expect(studentsMissingWorkshopAnyMonth(c).map((s) => s.name)).toEqual(['PEREZ RUIZ, ANA', 'LUNA DIAZ, ROSA']);
    c.attendanceMonths = [];
    expect(studentsMissingWorkshopAnyMonth(c)).toEqual([]);
  });
  it('puts the workshop in the report rows, also on a blank sheet', () => {
    const { c, am } = classWithMonth();
    expect(buildAttendanceReport(c, settings, am, false).rows.map((f) => f.workshop)).toEqual(['CARP', '', 'COMP']);
    expect(buildAttendanceReport(c, settings, am, true).rows[0].workshop).toBe('CARP');
  });
});

describe('attendance export', () => {
  beforeAll(async () => setLogos({ left: null, right: null }));

  it('writes one sheet per class with the month opened, day columns and Observaciones', async () => {
    const { c } = classWithMonth();
    const other = newClass('4° E - SECUNDARIA', '', [newStudent('X, Y', 3)]);
    const bytes = await buildAttendanceWorkbook([c, other], '2026-09', settings);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['5°A']);
    const ws = wb.worksheets[0];
    // Taller in B, names in C, days 1-4 in D..G, Observaciones in H
    expect([2, 3].map((col) => ws.getCell(6, col).value)).toEqual(['TALLER', 'APELLIDOS Y NOMBRES']);
    expect([4, 5, 6, 7].map((col) => ws.getCell(6, col).value)).toEqual([1, 2, 3, 4]);
    expect(ws.getCell(6, 8).value).toBe('OBSERVACIONES');
    expect([7, 8, 9].map((row) => ws.getCell(row, 2).value)).toEqual(['CARP', null, 'COMP']);
    expect(ws.getCell('A4').value).toBe('5° A - SECUNDARIA');
    expect(ws.getCell('D4').value).toBe('MES DE SETIEMBRE DEL 2026');
    expect(ws.getCell('F4').value).toBe('TUTOR: ANA PRUEBA');
    expect(ws.getCell('F5').value).toBe('BUZO: LUNES Y JUEVES');
    expect([4, 5, 6, 7].map((col) => ws.getCell(7, col).value)).toEqual(['A', 'T', 'F', 'T']);
    expect(ws.getCell(7, 8).value).toBe('2T  1F');
    expect(ws.getCell('D8').value).toBe('TRASLADO');
    expect(ws.getCell('D8').isMerged).toBe(true);
    expect(ws.getCell(9, 6).value).toBeNull();
    expect(ws.getCell(9, 8).value).toBe('1J');
  });

  it('prints a blank sheet for a class that has no attendance data yet', () => {
    const lone = newClass('4° E - SECUNDARIA', 'Luis', [newStudent('X, Y', 3)]);
    const withMonth = { ...lone, attendanceMonths: [{ month: '2026-09', days: [1, 2, 3] }] };
    const bytes = buildAttendancePdf([withMonth], '2026-09', settings, true);
    expect((new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page(?!s)/g) ?? []).length).toBe(1);
    expect(lone.attendanceMonths).toEqual([]);
  });

  it('writes a landscape PDF with one page per class that has the month', () => {
    const { c } = classWithMonth();
    const bytes = buildAttendancePdf([c, c], '2026-09', settings);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect((new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(2);
  });
});
