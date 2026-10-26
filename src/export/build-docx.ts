import { strToU8, zipSync } from 'fflate';
import {
  CRITERIA_HEADER,
  HOLIDAY_LABEL,
  NORMS_HEADER_LABELS,
  type NormsDay,
  type NormsReport,
} from '../domain/norms-layout';

/**
 * Minimal hand-written .docx (A4 landscape, Arial) of the monthly norms reports: one block per student, one table per
 * week like her template. No Word library: the file is a zip of a few XML parts.
 */

const PAGE = { width: 16838, height: 11906, margin: 720 };
const TEXT_WIDTH = PAGE.width - PAGE.margin * 2;
const FIRST_COLUMN = 1900;
const DAY_COLUMN = Math.floor((TEXT_WIDTH - FIRST_COLUMN) / 5);

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** Escapes text for XML and drops characters XML does not allow. */
export function escapeXml(text: string): string {
  return (
    text
      // Characters XML forbids: most control characters, U+FFFE/U+FFFF and unpaired surrogates
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
      .replace(/[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g, (m) => (m.length === 2 ? m : ''))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

interface RunStyle {
  bold?: boolean;
  /** Half-points (16 = 8 pt). */
  size?: number;
}

const run = (text: string, { bold, size }: RunStyle = {}): string =>
  `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}</w:rPr>` +
  // A line break typed in a paragraph becomes a Word line break
  `${text
    .split(/\r?\n/)
    .map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join('<w:br/>')}</w:r>`;

const paragraph = (
  runs: string,
  opts: { center?: boolean; pageBreakBefore?: boolean; keepNext?: boolean } = {},
): string =>
  `<w:p><w:pPr>${opts.keepNext ? '<w:keepNext/>' : ''}${opts.pageBreakBefore ? '<w:pageBreakBefore/>' : ''}${opts.center ? '<w:jc w:val="center"/>' : ''}</w:pPr>${runs}</w:p>`;

function cell(
  width: number,
  content: string,
  opts: { shade?: boolean; vMerge?: 'restart' | 'continue'; center?: boolean } = {},
) {
  const merge =
    opts.vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : opts.vMerge === 'continue' ? '<w:vMerge/>' : '';
  const shade = opts.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>' : '';
  const vAlign = opts.center ? '<w:vAlign w:val="center"/>' : '';
  const body = content === '' ? '<w:p/>' : content;
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${merge}${shade}${vAlign}</w:tcPr>${body}</w:tc>`;
}

const row = (cells: string[], header = false): string =>
  `<w:tr><w:trPr><w:cantSplit/>${header ? '<w:tblHeader/>' : ''}</w:trPr>${cells.join('')}</w:tr>`;

function weekTable(criteria: string[], week: NormsDay[]): string {
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
  const header = row(
    [
      cell(FIRST_COLUMN, paragraph(run(CRITERIA_HEADER, { bold: true, size: 18 })), { shade: true }),
      ...week.map((d) =>
        cell(DAY_COLUMN, paragraph(run(d.header, { bold: true, size: 18 }), { center: true }), { shade: true }),
      ),
    ],
    true,
  );
  const body = criteria.map((name, i) =>
    row([
      cell(FIRST_COLUMN, paragraph(run(name, { bold: true, size: 18 })), { center: true }),
      ...week.map((d) => {
        if (!d.holiday) return cell(DAY_COLUMN, d.texts[i] ? paragraph(run(d.texts[i], { size: 16 })) : '');
        return i === 0
          ? cell(DAY_COLUMN, paragraph(run(HOLIDAY_LABEL, { bold: true, size: 18 }), { center: true }), {
              vMerge: 'restart',
              center: true,
            })
          : cell(DAY_COLUMN, '', { vMerge: 'continue' });
      }),
    ]),
  );
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${FIRST_COLUMN}"/>${week.map(() => `<w:gridCol w:w="${DAY_COLUMN}"/>`).join('')}</w:tblGrid>` +
    header +
    body.join('') +
    `</w:tbl>`
  );
}

function reportXml(r: NormsReport, first: boolean): string {
  const L = NORMS_HEADER_LABELS;
  return [
    paragraph(run(r.title, { bold: true, size: 24 }), { center: true, pageBreakBefore: !first }),
    paragraph(''),
    paragraph(
      run(`${L.name}: ${r.name}    ${L.course}: ${r.course}    `) + run(`${L.month}: ${r.month}`, { bold: true }),
    ),
    paragraph(run(`${L.tutor}: ${r.tutor}`)),
    paragraph(''),
    // A paragraph between tables keeps Word from merging them
    // Between weeks a small caption names the student, so a week that lands on another page is never anonymous
    ...r.weeks.map(
      (w, i) =>
        weekTable(r.criteria, w) +
        (i < r.weeks.length - 1
          ? paragraph(run(`${r.name} · ${r.month}`, { bold: true, size: 16 }), { keepNext: true })
          : paragraph('')),
    ),
  ].join('');
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>` +
  `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-ES"/>` +
  `</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/** One .docx with the reports one after another, each starting on a new page. */
export function buildNormsDocx(reports: NormsReport[]): Uint8Array {
  const section =
    `<w:sectPr><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}" w:orient="landscape"/>` +
    `<w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>` +
    reports.map((r, i) => reportXml(r, i === 0)).join('') +
    section +
    `</w:body></w:document>`;
  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    'word/document.xml': strToU8(document),
    'word/_rels/document.xml.rels': strToU8(DOCUMENT_RELS),
    'word/styles.xml': strToU8(STYLES),
  });
}
