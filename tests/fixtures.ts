import { zipSync, strToU8 } from 'fflate';

export interface SheetFixture {
  name: string;
  label: string;
  students: string[];
  /** Gender cell of each student, written in column D under `genderHeader`. */
  genders?: string[];
  /** Text of the gender column header (default "S"); `genderHeaderRow` 10 puts it on the second header row. */
  genderHeader?: string;
  genderHeaderRow?: 9 | 10;
  /** Workshop cell of each student, written in column E under a "TALLER" header. */
  workshops?: string[];
  /** Number of invisible shapes to add to the sheet's drawing. */
  shapes?: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Workbook in the same format as the teachers' ones: header on rows 9–10, students from row 11. */
export function teacherWorkbook(sheets: SheetFixture[]): Uint8Array {
  const sharedStrings: string[] = [];
  const idx = (s: string) => {
    let i = sharedStrings.indexOf(s);
    if (i < 0) i = sharedStrings.push(s) - 1;
    return i;
  };
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((h, n) => {
    const rows: string[] = [];
    const cell = (ref: string, text: string) => `<c r="${ref}" t="s"><v>${idx(text)}</v></c>`;
    rows.push(`<row r="1">${cell('A1', 'REGISTRO AUXILIAR - II TRIMESTRE 2026')}</row>`);
    rows.push(`<row r="3">${cell('B3', h.label)}</row>`);
    rows.push(
      `<row r="9">${cell('A9', 'N°')}${cell('B9', 'APELLIDOS Y NOMBRES')}${cell('C9', 'CRITERIOS DE EVALUACIÓN')}${h.genders && h.genderHeaderRow !== 10 ? cell('D9', h.genderHeader ?? 'S') : ''}${h.workshops ? cell('E9', 'TALLER') : ''}</row>`,
    );
    rows.push(
      `<row r="10">${cell('C10', '1')}${h.genders && h.genderHeaderRow === 10 ? cell('D10', h.genderHeader ?? 'S') : ''}</row>`,
    );
    h.students.forEach((name, i) => {
      const r = 11 + i;
      const gender = h.genders?.[i] ? cell(`D${r}`, h.genders[i]) : '';
      const workshop = h.workshops?.[i] ? cell(`E${r}`, h.workshops[i]) : '';
      rows.push(`<row r="${r}"><c r="A${r}"><v>${i + 1}</v></c>${cell(`B${r}`, name)}${gender}${workshop}</row>`);
    });
    const end = 11 + h.students.length;
    rows.push(`<row r="${end + 1}">${cell(`B${end + 1}`, 'FECHA DE ENTREGA: ______')}</row>`);
    rows.push(
      `<row r="${end + 5}">${cell(`A${end + 5}`, 'N°')}${cell(`B${end + 5}`, 'Criterios de evaluación (Escribirlos)')}</row>`,
    );
    rows.push(`<row r="${end + 6}"><c r="A${end + 6}"><v>1</v></c></row>`);
    files[`xl/worksheets/sheet${n + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`,
    );
    if (h.shapes !== undefined) {
      let d =
        '<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      d +=
        '<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="100" cy="100"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="logo"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
      for (let i = 0; i < h.shapes; i++) {
        d += `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="0" cy="9525"/><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="${i + 10}" name="Shape ${i}"/></xdr:nvGrpSpPr></xdr:grpSp><xdr:clientData/></xdr:oneCellAnchor>`;
        d += `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col></xdr:from><xdr:to><xdr:col>1</xdr:col></xdr:to><xdr:cxnSp><xdr:nvCxnSpPr><xdr:cNvPr id="${i + 99999}" name="Line ${i}"/></xdr:nvCxnSpPr></xdr:cxnSp><xdr:clientData/></xdr:twoCellAnchor>`;
      }
      d += '</xdr:wsDr>';
      files[`xl/drawings/drawing${n + 1}.xml`] = strToU8(d);
    }
  });
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
  );
  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((h, n) => `<sheet name="${esc(h.name)}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, n) => `<Relationship Id="rId${n + 1}" Type="x" Target="worksheets/sheet${n + 1}.xml"/>`)
      .join('')}</Relationships>`,
  );
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sharedStrings
      .map((s) => `<si><t>${esc(s)}</t></si>`)
      .join('')}</sst>`,
  );
  files['xl/media/image1.png'] = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  return zipSync(files);
}
