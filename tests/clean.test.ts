import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { cleanWorkbook } from '../src/import/clean';
import { readNames } from '../src/import/read-names';
import { teacherWorkbook } from './fixtures';

describe('cleanWorkbook (test workbook)', () => {
  const original = teacherWorkbook([
    { name: '4ºA', label: '4to A - SECUNDARIA', students: ['PEREZ RUIZ, ANA', 'GOMEZ LEON, LUIS'], shapes: 3000 },
  ]);
  const r = cleanWorkbook(original);
  const parts = unzipSync(r.bytes);
  const drawing = new TextDecoder().decode(parts['xl/drawings/drawing1.xml']);

  it('removes the invisible shapes and keeps the image', () => {
    expect(r.removed).toBe(6000);
    expect(drawing).not.toContain('Shape');
    expect(drawing).not.toContain('Line');
    expect(drawing).toContain('<xdr:pic>');
    expect(drawing.startsWith('<?xml')).toBe(true);
    expect(drawing.endsWith('</xdr:wsDr>')).toBe(true);
    expect(r.after).toBeLessThan(r.before);
  });
  it('keeps sheets, texts and images', () => {
    expect(Object.keys(parts)).toEqual(
      expect.arrayContaining(['xl/worksheets/sheet1.xml', 'xl/sharedStrings.xml', 'xl/media/image1.png']),
    );
    expect(Object.keys(parts)[0]).toBe('[Content_Types].xml');
    expect(readNames(r.bytes)[0].names).toEqual(['PEREZ RUIZ, ANA', 'GOMEZ LEON, LUIS']);
  });
});

// A real heavy workbook is never committed: point the variable at one locally (the test is skipped otherwise)
const REAL = process.env.VALEDOCS_OWN_FILE ?? '';
describe.skipIf(REAL === '' || !existsSync(REAL))('real heavy workbook', () => {
  it('gets much lighter', () => {
    const t0 = Date.now();
    const r = cleanWorkbook(new Uint8Array(readFileSync(REAL)));
    const ms = Date.now() - t0;
    console.log(
      `real cleanup: ${(r.before / 1e6).toFixed(2)} MB -> ${(r.after / 1e6).toFixed(3)} MB, ${r.removed} shapes, ${ms} ms`,
    );
    writeFileSync(join(tmpdir(), 'valedocs-clean-test.xlsx'), r.bytes);
    expect(r.after).toBeLessThan(1_000_000);
    expect(readNames(r.bytes)).toHaveLength(6);
  });
});
