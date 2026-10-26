import { beforeAll, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { buildWorkbook } from '../src/export/build-xlsx';
import { buildPdf } from '../src/export/build-pdf';
import { defaultSettings, newStudent, newClass, type SchoolClass } from '../src/domain/model';
import { readNames } from '../src/import/read-names';
import { setLogos } from '../src/storage/logos';

const PNG = {
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  width: 4,
  height: 3,
};

function schoolClass(label: string, names: string[]): SchoolClass {
  const settings = defaultSettings();
  const students = names.map((n) => newStudent(n, settings.columns.length));
  return newClass(label, 'ana prueba', students);
}

describe('export', () => {
  const settings = defaultSettings();
  beforeAll(async () => setLogos({ left: PNG, right: PNG }));
  const names = Array.from({ length: 31 }, (_, i) => `APELLIDO${i + 1} NOMBRE, Ñandú Ángel ${i + 1}`);
  const a = schoolClass('5° A - SECUNDARIA', names);
  const b = schoolClass('5° B - SECUNDARIA', ['LUNA DIAZ, ROSA', 'PEREZ RUIZ, ANA']);
  a.students[0].grades = ['A', 'AD', 'B'];
  a.students[1].note = 'TRASLADO AL EXTRANJERO';
  a.students[2].grades = ['C', 'A', ''];

  it('the Excel file contains what was entered, is light and can be reopened', async () => {
    const bytes = await buildWorkbook([a, b], settings);
    writeFileSync(join(tmpdir(), 'report_test.xlsx'), bytes);
    expect(bytes.length).toBeLessThan(150_000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['5°A', '5°B']);
    const ws = wb.getWorksheet('5°A')!;
    expect(ws.getCell('B1').value).toBe(settings.institution1);
    expect(ws.getCell('A7').value).toBe('5° A - SECUNDARIA');
    expect(ws.getCell('C7').value).toBe('TUTOR: ANA PRUEBA');
    // header cells span both header rows, with the two lines stacked in one cell
    expect(ws.getCell('C9').value).toBe('PRESENTACION\nPERSONAL');
    expect(ws.getCell('C10').master.address).toBe('C9');
    expect(ws.getCell('D10').master.address).toBe('D9');
    expect(ws.getCell('E9').value).toBe('COMPORTAMIENTO');
    expect(ws.getCell('B11').value).toBe(names[0]);
    expect([ws.getCell('C11').value, ws.getCell('D11').value, ws.getCell('E11').value]).toEqual(['A', 'AD', 'B']);
    expect(ws.getCell('C12').value).toBe('TRASLADO AL EXTRANJERO');
    expect(ws.getCell('D13').value).toBe('A');
    expect(ws.getCell('E13').value).toBeNull();
    expect(ws.getCell('B41').value).toBe(names[30]);
    expect(ws.getImages().length).toBe(2);
  });

  it('the names in the exported Excel can be imported again', async () => {
    const bytes = await buildWorkbook([a, b], settings);
    const classes = readNames(bytes);
    expect(classes.map((c) => c.names.length)).toEqual([31, 2]);
    expect(classes[0].names[0]).toBe(names[0]);
  });

  it('the PDF has one page per class, plus a blank sheet', () => {
    const pdf = buildPdf([a, b], settings);
    writeFileSync(join(tmpdir(), 'report_test.pdf'), pdf);
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF')).toBe(true);
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(2);
    const blank = buildPdf([a], settings, true);
    writeFileSync(join(tmpdir(), 'report_blank.pdf'), blank);
    expect((new TextDecoder('latin1').decode(blank).match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
  });
});
