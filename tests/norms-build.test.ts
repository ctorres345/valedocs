import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { findMonth, setMonthDays, weekdaysOf } from '../src/domain/attendance';
import { defaultSettings, newClass, newStudent } from '../src/domain/model';
import { normsOf } from '../src/domain/norms';
import { buildNormsReport } from '../src/domain/norms-layout';
import { buildNormsDocx, escapeXml } from '../src/export/build-docx';
import { buildNormsPdf } from '../src/export/build-pdf';

const settings = defaultSettings();

function reports(names = ['PEREZ & SOTO, "ANA"', 'LUNA, ROSA']) {
  const c = newClass(
    '5° A - SECUNDARIA',
    'Ana Prueba',
    names.map((n) => newStudent(n, 3)),
  );
  setMonthDays(
    c,
    '2026-07',
    weekdaysOf('2026-07').filter((d) => d !== 7 && d < 27),
  );
  const am = findMonth(c, '2026-07')!;
  for (const s of c.students) normsOf(s, am, 3)[0][0] = 'AD';
  return c.students.map((s) => buildNormsReport(c, s, settings, am));
}

describe('norms Word file', () => {
  const docx = (r = reports()) => unzipSync(buildNormsDocx(r));
  const xml = (r = reports()) => strFromU8(docx(r)['word/document.xml']);

  it('is a zip with the parts Word needs, styles linked and declared', () => {
    const files = docx();
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/styles.xml',
    ]);
    expect(strFromU8(files['[Content_Types].xml'])).toContain('/word/styles.xml');
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('Target="styles.xml"');
  });
  it('is A4 landscape with one table per week and students on separate pages', () => {
    const x = xml();
    expect(x).toContain('w:w="16838" w:h="11906" w:orient="landscape"');
    expect((x.match(/<w:tbl>/g) ?? []).length).toBe(8); // 4 weeks × 2 students
    expect((x.match(/<w:pageBreakBefore\/>/g) ?? []).length).toBe(1);
    expect(x).toContain('Miércoles 1');
    expect(x).toContain('MES: Julio');
  });
  it('prints the paragraph, not the letter, and merges holidays over the criteria', () => {
    const x = xml();
    expect(x).toContain('El estudiante asiste puntualmente todos los días');
    expect(x).not.toMatch(/<w:t[^>]*>AD<\/w:t>/);
    expect(x).toContain('FERIADO');
    expect((x.match(/<w:vMerge w:val="restart"\/>/g) ?? []).length).toBe(2); // the 7th, once per student
    expect((x.match(/<w:vMerge\/>/g) ?? []).length).toBe(4); // two more criteria rows each
  });
  it('keeps rows together and repeats the header row', () => {
    const x = xml();
    const rows = (x.match(/<w:tr>/g) ?? []).length;
    expect((x.match(/<w:cantSplit\/>/g) ?? []).length).toBe(rows);
    expect((x.match(/<w:tblHeader\/>/g) ?? []).length).toBe(8);
  });
  it('escapes special characters in names so the XML stays valid', () => {
    const x = xml();
    expect(x).toContain('PEREZ &amp; SOTO, &quot;ANA&quot;');
    expect(escapeXml('a<b>&"\u0001')).toBe('a&lt;b&gt;&amp;&quot;');
    const tags = x.match(/<\/?w:[a-zA-Z]+[^>]*>/g) ?? [];
    const stack: string[] = [];
    for (const t of tags) {
      const name = /^<\/?(w:[a-zA-Z]+)/.exec(t)![1];
      if (t.endsWith('/>')) continue;
      if (t.startsWith('</')) expect(stack.pop()).toBe(name);
      else stack.push(name);
    }
    expect(stack).toEqual([]);
  });
});

describe('norms PDF', () => {
  it('writes a landscape PDF with a new page for each student', () => {
    const bytes = buildNormsPdf(reports(['A, A', 'B, B', 'C, C']));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pages = (new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(3);
  });
});

describe('zip of files', () => {
  it('fflate round trip keeps names with accents', () => {
    const z = unzipSync(zipSync({ '5°A - 01 MUÑOZ, ANA - Julio 2026.docx': strToU8('x') }));
    expect(Object.keys(z)).toEqual(['5°A - 01 MUÑOZ, ANA - Julio 2026.docx']);
  });
});

describe('norms download', () => {
  it('builds one file for everyone, or a zip with one file per student', async () => {
    const { buildNormsDownload } = await import('../src/export/norms-files');
    const c = newClass(
      '5° A - SECUNDARIA',
      'Ana Prueba',
      ['MUÑOZ, ANA', 'LUNA, ROSA'].map((n) => newStudent(n, 3)),
    );
    setMonthDays(c, '2026-07', [1, 2]);
    const am = findMonth(c, '2026-07')!;
    for (const s of c.students) normsOf(s, am, 3)[0][0] = 'A';
    const single = buildNormsDownload(c, am, settings, c.students, 'docx', 'single');
    expect(single.name).toBe('5°A - Normas Julio 2026.docx');
    expect(Object.keys(unzipSync(single.bytes))).toContain('word/document.xml');
    const zip = buildNormsDownload(c, am, settings, c.students, 'pdf', 'zip');
    expect(zip.name).toBe('5°A - Normas Julio 2026.zip');
    expect(Object.keys(unzipSync(zip.bytes)).sort()).toEqual([
      '5°A - 01 MUÑOZ, ANA - Julio 2026.pdf',
      '5°A - 02 LUNA, ROSA - Julio 2026.pdf',
    ]);
  });
});

describe('norms Word text edge cases', () => {
  it('turns typed line breaks into Word line breaks and drops illegal characters', () => {
    expect(escapeXml('a\u0000b￾\ud800c')).toBe('abc');
    const r = reports();
    r[0].name = 'LINEA UNO\nLINEA DOS';
    const xml = strFromU8(unzipSync(buildNormsDocx(r))['word/document.xml']);
    expect(xml).toContain('LINEA UNO</w:t><w:br/><w:t xml:space="preserve">LINEA DOS');
  });
});

describe('student name on every week', () => {
  it('puts a caption with the student between week tables in Word', () => {
    const x = strFromU8(unzipSync(buildNormsDocx(reports(['LUNA, ROSA'])))['word/document.xml']);
    expect((x.match(/LUNA, ROSA · Julio/g) ?? []).length).toBe(3); // 4 weeks → 3 captions
  });
});
