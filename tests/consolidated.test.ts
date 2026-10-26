import { beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { findMonth, recordOf, setMonthDays } from '../src/domain/attendance';
import { buildConsolidatedReport, countMarks, initialMonths, rowCells } from '../src/domain/consolidated-layout';
import { defaultSettings, newClass, newStudent } from '../src/domain/model';
import { buildConsolidatedWorkbook } from '../src/export/build-xlsx';
import { buildConsolidatedPdf } from '../src/export/build-pdf';
import { setLogos } from '../src/storage/logos';

const settings = { ...defaultSettings(), term: 'III TRIMESTRE 2026' };

/** Three students over October and November; Rosa leaves the school in November. */
function classWithMonths() {
  const c = newClass('5° A - SECUNDARIA', 'Ana Prueba', [
    newStudent('PEREZ RUIZ, ANA', 3),
    newStudent('LUNA DIAZ, ROSA', 3),
    newStudent('SOTO, LUIS', 3),
  ]);
  setMonthDays(c, '2026-10', [1, 2, 5, 6]);
  setMonthDays(c, '2026-11', [2, 3, 4]);
  const oct = findMonth(c, '2026-10')!;
  const nov = findMonth(c, '2026-11')!;
  recordOf(c.students[0], oct).marks = ['A', 'F', 'T', 'J'];
  recordOf(c.students[0], nov).marks = ['F', 'U', 'F'];
  recordOf(c.students[1], oct).marks = ['T', 'T', 'A', ''];
  recordOf(c.students[1], nov).note = 'TRASLADO A OTRA I.E.';
  return c;
}

describe('consolidated layout', () => {
  it('counts F, T, J and U and ignores present and unmarked days', () => {
    expect(countMarks(['A', 'F', 'T', 'J', 'U', 'F', ''])).toEqual([2, 1, 1, 1]);
  });

  it('builds one count group per month (sorted) and the totals', () => {
    const r = buildConsolidatedReport(classWithMonths(), settings, ['2026-11', '2026-10']);
    expect(r.title).toBe('CONSOLIDADO DE FALTAS Y TARDANZAS III TRIMESTRE 2026');
    expect(r.months).toEqual(['OCTUBRE', 'NOVIEMBRE']);
    const ana = r.rows[0];
    expect(ana.counts).toEqual([
      [1, 1, 1, 0],
      [2, 0, 0, 1],
    ]);
    expect(ana.totals).toEqual([3, 1, 1, 1]);
    expect(rowCells(ana)).toEqual({ values: ['1', '1', '1', '', '2', '', '', '1', '3', '1', '1', '1'], note: null });
    // Luis has no marks at all: every cell blank
    expect(rowCells(r.rows[2]).values.every((v) => v === '')).toBe(true);
  });

  it('prints a special note from the month it starts, over the totals too', () => {
    const r = buildConsolidatedReport(classWithMonths(), settings, ['2026-10', '2026-11']);
    const rosa = r.rows[1];
    expect(rosa.note).toBe('TRASLADO A OTRA I.E.');
    expect(rosa.noteFrom).toBe(1);
    expect(rowCells(rosa)).toEqual({ values: ['', '2', '', ''], note: { start: 4, span: 8 } });
  });

  it('leaves a month the class does not have empty', () => {
    const r = buildConsolidatedReport(classWithMonths(), settings, ['2026-09', '2026-10']);
    expect(r.months).toEqual(['SETIEMBRE', 'OCTUBRE']);
    expect(r.rows[0].counts[0]).toBeNull();
    expect(r.rows[0].totals).toEqual([1, 1, 1, 0]);
  });

  it('does not create records on the students', () => {
    const c = newClass('4° E - SECUNDARIA', '', [newStudent('X, Y', 3)]);
    setMonthDays(c, '2026-10', [1, 2]);
    buildConsolidatedReport(c, settings, ['2026-10']);
    expect(c.students[0].attendance).toEqual({});
  });
});

describe('consolidated export', () => {
  beforeAll(async () => setLogos({ left: null, right: null }));

  it('writes one sheet per class with month groups, totals and the merged note', async () => {
    const bytes = await buildConsolidatedWorkbook([classWithMonths()], ['2026-10', '2026-11'], settings);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['5°A']);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A4').value).toBe('CONSOLIDADO DE FALTAS Y TARDANZAS III TRIMESTRE 2026');
    expect(ws.getCell('A6').value).toBe('5° A - SECUNDARIA');
    expect(ws.getCell('C6').value).toBe('ASISTENCIA Y PUNTUALIDAD');
    expect(ws.getCell('K6').value).toBe('TOTAL');
    expect([3, 7].map((col) => ws.getCell(7, col).value)).toEqual(['OCTUBRE', 'NOVIEMBRE']);
    expect([...Array(12)].map((_, k) => ws.getCell(8, 3 + k).value)).toEqual([
      'F',
      'T',
      'J',
      'U',
      'F',
      'T',
      'J',
      'U',
      'TF',
      'TT',
      'TJ',
      'TU',
    ]);
    expect([...Array(12)].map((_, k) => ws.getCell(9, 3 + k).value)).toEqual([
      1,
      1,
      1,
      null,
      2,
      null,
      null,
      1,
      3,
      1,
      1,
      1,
    ]);
    expect(ws.getCell('G10').value).toBe('TRASLADO A OTRA I.E.');
    expect(ws.getCell('N10').isMerged).toBe(true);
    expect(ws.getCell('D10').value).toBe(2);
  });

  it('can stack every class in one sheet, each block with its own header', async () => {
    const other = newClass('4° E - SECUNDARIA', '', [newStudent('X, Y', 3)]);
    setMonthDays(other, '2026-10', [1]);
    const bytes = await buildConsolidatedWorkbook([classWithMonths(), other], ['2026-10', '2026-11'], settings, true);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Consolidado']);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A6').value).toBe('5° A - SECUNDARIA');
    expect(ws.getCell('B11').value).toBe('SOTO, LUIS');
    // First block ends at row 11; the second starts after 3 empty rows (its row 1 is row 15)
    expect(ws.getCell('B15').value).toBe(settings.institution1);
    expect(ws.getCell('A18').value).toBe('CONSOLIDADO DE FALTAS Y TARDANZAS III TRIMESTRE 2026');
    expect(ws.getCell('A20').value).toBe('4° E - SECUNDARIA');
    expect(ws.getCell('B23').value).toBe('X, Y');
    // 4°E has no November: its cells stay empty
    expect(ws.getCell('G23').value).toBeNull();
  });

  it('writes a PDF with one page per class', () => {
    const c = classWithMonths();
    const bytes = buildConsolidatedPdf([c, c], ['2026-10', '2026-11'], settings);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect((new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(2);
  });
});

describe('initial months', () => {
  const all = ['2026-06', '2026-07', '2026-10', '2026-11', '2027-03'];
  it('ticks every month the first time', () => {
    expect(initialMonths(all, null)).toEqual(all);
  });
  it('keeps her last choice, including an unticked latest month', () => {
    const seen = ['2026-06', '2026-07', '2026-10', '2026-11'];
    expect(initialMonths(seen, { chosen: ['2026-10'], seen })).toEqual(['2026-10']);
  });
  it('ticks months opened after her last choice and ignores deleted ones', () => {
    const seen = ['2026-06', '2026-07', '2026-08', '2026-10', '2026-11'];
    expect(initialMonths(all, { chosen: ['2026-08', '2026-10', '2026-11'], seen })).toEqual([
      '2026-10',
      '2026-11',
      '2027-03',
    ]);
  });
});
