import { jsPDF } from 'jspdf';
import autoTable, { type CellDef } from 'jspdf-autotable';
import type { Settings, SchoolClass } from '../domain/model';
import { buildReport, columnHeader, NAME_HEADER, NUMBER_HEADER, type Report } from '../domain/report-layout';
import {
  ATTENDANCE_NAME_WIDTH,
  WORKSHOP_HEADER,
  OBSERVATIONS_HEADER,
  buildAttendanceReport,
  titleSplit,
  type AttendanceReport,
} from '../domain/attendance-layout';
import { classesWithMonth } from '../domain/attendance';
import {
  CONSOLIDATED_GROUP_HEADER,
  COUNTED_CODES,
  TOTAL_CODES,
  TOTAL_HEADER,
  buildConsolidatedReport,
  countColumns,
  rowCells,
  type ConsolidatedReport,
} from '../domain/consolidated-layout';
import { CRITERIA_HEADER, HOLIDAY_LABEL, NORMS_HEADER_LABELS, type NormsReport } from '../domain/norms-layout';
import { QUARTER_LABELS, QUARTER_PER_PAGE, type QuarterSheet } from '../domain/quarter-layout';
import { imageFormat, getLogos } from '../storage/logos';

const MARGIN = 12;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;

/** School logos on both sides of the page header. */
function drawLogos(doc: jsPDF, pageWidth: number): void {
  const { left, right } = getLogos();
  if (left) {
    const height = 15;
    doc.addImage(
      left.uri,
      imageFormat(left.uri) === 'png' ? 'PNG' : 'JPEG',
      MARGIN,
      MARGIN - 2,
      (height * left.width) / left.height,
      height,
      'logo-left',
    );
  }
  if (right) {
    const height = 14;
    const width = (height * right.width) / right.height;
    doc.addImage(
      right.uri,
      imageFormat(right.uri) === 'png' ? 'PNG' : 'JPEG',
      pageWidth - MARGIN - width,
      MARGIN - 2,
      width,
      height,
      'logo-right',
    );
  }
}

function drawPage(doc: jsPDF, r: Report): void {
  const width = PAGE_WIDTH - MARGIN * 2;
  const center = PAGE_WIDTH / 2;

  drawLogos(doc, PAGE_WIDTH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(r.institution1, center, MARGIN + 4, { align: 'center' });
  doc.text(r.institution2, center, MARGIN + 10, { align: 'center' });

  let y = MARGIN + 24;
  doc.setFontSize(11);
  doc.text(r.title1, center, y, { align: 'center', maxWidth: width });
  y += 6;
  if (r.title2.trim() !== '') {
    doc.text(r.title2, center, y, { align: 'center', maxWidth: width });
    y += 6;
  }
  doc.setFontSize(12);
  doc.text(r.term, center, y, { align: 'center' });
  y += 8;
  doc.text(r.label, MARGIN + 2, y);
  doc.text(r.tutor, PAGE_WIDTH - MARGIN - 2, y, { align: 'right' });
  y += 4;

  const n = r.columns.length;
  const hasLine2 = r.columns.some((c) => c.line2.trim() !== '');
  const headHeight = hasLine2 ? 11 : 7;
  const available = PAGE_HEIGHT - MARGIN - y - headHeight;
  const rowHeight = Math.max(5, Math.min(8, available / Math.max(1, r.rows.length)));
  const formatSize = rowHeight < 6 ? 8.5 : rowHeight < 7 ? 9.5 : 10.5;

  const head: CellDef[][] = [
    [
      { content: NUMBER_HEADER },
      { content: NAME_HEADER },
      ...r.columns.map((c): CellDef => ({ content: columnHeader(c) })),
    ],
  ];

  const body: CellDef[][] = r.rows.map((f): CellDef[] =>
    f.note !== ''
      ? [
          { content: String(f.position) },
          { content: f.name },
          { content: f.note, colSpan: n, styles: { fontStyle: 'bold' } },
        ]
      : [{ content: String(f.position) }, { content: f.name }, ...f.grades.map((x): CellDef => ({ content: x }))],
  );

  const numberWidth = 10;
  const gradeWidth = Math.min(34, (width - numberWidth - 70) / n);
  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = {
    0: { cellWidth: numberWidth, halign: 'center' },
    1: { cellWidth: width - numberWidth - gradeWidth * n, halign: 'left' },
  };
  for (let k = 0; k < n; k++) columnStyles[2 + k] = { cellWidth: gradeWidth, halign: 'center' };

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    head,
    body,
    theme: 'grid',
    tableWidth: width,
    styles: {
      font: 'helvetica',
      fontSize: formatSize,
      cellPadding: { top: 0.6, bottom: 0.6, left: 1.5, right: 1.5 },
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      valign: 'middle',
      halign: 'center',
      minCellHeight: rowHeight,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 9,
      minCellHeight: headHeight,
    },
    columnStyles,
  });
}

/** Print-ready PDF: one page per class. With `blank` the grades are empty. */
export function buildPdf(classes: SchoolClass[], settings: Settings, blank = false): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  classes.forEach((schoolClass, i) => {
    if (i > 0) doc.addPage();
    drawPage(doc, buildReport(schoolClass, settings, blank));
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

const LANDSCAPE_WIDTH = PAGE_HEIGHT;
const LANDSCAPE_HEIGHT = PAGE_WIDTH;

function drawAttendancePage(doc: jsPDF, r: AttendanceReport): void {
  const width = LANDSCAPE_WIDTH - MARGIN * 2;
  const center = LANDSCAPE_WIDTH / 2;
  drawLogos(doc, LANDSCAPE_WIDTH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(r.institution1, center, MARGIN + 3, { align: 'center' });
  doc.text(r.institution2, center, MARGIN + 8, { align: 'center' });
  doc.text(r.term, center, MARGIN + 14, { align: 'center' });
  let y = MARGIN + 21;
  doc.setFontSize(10);
  doc.text(r.label, MARGIN + 2, y);
  doc.text(r.title, center, y, { align: 'center' });
  doc.text(r.tutor, LANDSCAPE_WIDTH - MARGIN - 2, y, { align: 'right' });
  if (r.uniformNote !== '') {
    y += 5;
    doc.text(r.uniformNote, LANDSCAPE_WIDTH - MARGIN - 2, y, { align: 'right' });
  }
  y += 3;

  const d = r.days.length;
  const { lastCol } = titleSplit(d);
  const numberWidth = 8;
  const workshopWidth = 12;
  const observationsWidth = 26;
  const nameWidth = ATTENDANCE_NAME_WIDTH * 1.6;
  const dayWidth = (width - numberWidth - workshopWidth - nameWidth - observationsWidth) / d;
  const headHeight = 7;
  const rowHeight = Math.max(
    4.5,
    Math.min(7, (LANDSCAPE_HEIGHT - MARGIN - y - headHeight) / Math.max(1, r.rows.length)),
  );

  const head: CellDef[][] = [
    [
      { content: NUMBER_HEADER },
      { content: WORKSHOP_HEADER },
      { content: NAME_HEADER },
      ...r.days.map((day): CellDef => ({ content: String(day) })),
      { content: OBSERVATIONS_HEADER },
    ],
  ];
  const body: CellDef[][] = r.rows.map((f): CellDef[] =>
    f.note !== ''
      ? [
          { content: String(f.position) },
          { content: f.workshop },
          { content: f.name },
          { content: f.note, colSpan: d + 1, styles: { fontStyle: 'bold' } },
        ]
      : [
          { content: String(f.position) },
          { content: f.workshop },
          { content: f.name },
          ...f.marks.map((x): CellDef => ({ content: x })),
          { content: f.summary },
        ],
  );
  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = {
    0: { cellWidth: numberWidth, halign: 'center' },
    1: { cellWidth: workshopWidth, halign: 'center' },
    2: { cellWidth: nameWidth, halign: 'left' },
    [lastCol - 1]: { cellWidth: observationsWidth, halign: 'center' },
  };
  for (let k = 0; k < d; k++) columnStyles[3 + k] = { cellWidth: dayWidth, halign: 'center' };

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    head,
    body,
    theme: 'grid',
    tableWidth: width,
    styles: {
      font: 'helvetica',
      fontSize: rowHeight < 5.5 ? 7.5 : 8.5,
      cellPadding: { top: 0.4, bottom: 0.4, left: 0.8, right: 0.8 },
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      valign: 'middle',
      halign: 'center',
      minCellHeight: rowHeight,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.5,
      minCellHeight: headHeight,
    },
    columnStyles,
  });
}

/** Print-ready attendance PDF (landscape): one page per class that has `month` opened. */
export function buildAttendancePdf(
  classes: SchoolClass[],
  month: string,
  settings: Settings,
  blank = false,
): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  classesWithMonth(classes, month).forEach(({ schoolClass, month: am }, i) => {
    if (i > 0) doc.addPage();
    drawAttendancePage(doc, buildAttendanceReport(schoolClass, settings, am, blank));
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

function drawConsolidatedPage(doc: jsPDF, r: ConsolidatedReport): void {
  const width = PAGE_WIDTH - MARGIN * 2;
  const center = PAGE_WIDTH / 2;
  drawLogos(doc, PAGE_WIDTH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(r.institution1, center, MARGIN + 4, { align: 'center' });
  doc.text(r.institution2, center, MARGIN + 10, { align: 'center' });
  doc.setFontSize(11.5);
  doc.text(r.title, center, MARGIN + 22, { align: 'center', maxWidth: width });
  doc.setFontSize(11);
  doc.text(r.label, MARGIN + 2, MARGIN + 30);
  const y = MARGIN + 33;

  const per = COUNTED_CODES.length;
  const counts = countColumns(r.months.length);
  const numberWidth = 8;
  const countWidth = Math.min(7, (width - numberWidth - 60) / counts);
  const nameWidth = width - numberWidth - countWidth * counts;
  const headHeight = 5.5;
  const rowHeight = Math.max(
    4.5,
    Math.min(7, (PAGE_HEIGHT - MARGIN - y - headHeight * 3) / Math.max(1, r.rows.length)),
  );
  const bold = { fontStyle: 'bold' as const };

  const head: CellDef[][] = [
    [
      { content: '', colSpan: 2, styles: { lineWidth: 0 } },
      ...(r.months.length > 0 ? [{ content: CONSOLIDATED_GROUP_HEADER, colSpan: r.months.length * per }] : []),
      { content: TOTAL_HEADER, colSpan: per, rowSpan: 2 },
    ],
    [
      { content: NUMBER_HEADER, rowSpan: 2 },
      { content: NAME_HEADER, rowSpan: 2 },
      ...r.months.map((m): CellDef => ({ content: m, colSpan: per })),
    ],
    [
      ...r.months.flatMap(() => COUNTED_CODES.map((c): CellDef => ({ content: c }))),
      ...TOTAL_CODES.map((c) => ({ content: c })),
    ],
  ];
  const totalsStart = r.months.length * per;
  const body: CellDef[][] = r.rows.map((f): CellDef[] => {
    const { values, note } = rowCells(f);
    return [
      { content: String(f.position) },
      { content: f.name },
      ...values.map((v, k): CellDef => ({ content: v, styles: k >= totalsStart ? bold : {} })),
      ...(note ? [{ content: f.note, colSpan: note.span, styles: { ...bold, fontSize: 7.5 } }] : []),
    ];
  });
  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = {
    0: { cellWidth: numberWidth, halign: 'center' },
    1: { cellWidth: nameWidth, halign: 'left' },
  };
  for (let k = 0; k < counts; k++) columnStyles[2 + k] = { cellWidth: countWidth, halign: 'center' };

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    head,
    body,
    theme: 'grid',
    tableWidth: width,
    styles: {
      font: 'helvetica',
      fontSize: rowHeight < 5.5 ? 8 : 9,
      cellPadding: { top: 0.4, bottom: 0.4, left: 0.8, right: 0.8 },
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      valign: 'middle',
      halign: 'center',
      minCellHeight: rowHeight,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.5,
      minCellHeight: headHeight,
    },
    columnStyles,
  });
}

/** Consolidated absences and tardies PDF (portrait): one page per class. */
export function buildConsolidatedPdf(classes: SchoolClass[], months: string[], settings: Settings): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  classes.forEach((schoolClass, i) => {
    if (i > 0) doc.addPage();
    drawConsolidatedPage(doc, buildConsolidatedReport(schoolClass, settings, months));
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

/** Monthly norms reports (landscape): one block per student, one table per week; a new page for each student. */
export function buildNormsPdf(reports: NormsReport[]): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const L = NORMS_HEADER_LABELS;
  reports.forEach((r, i) => {
    if (i > 0) doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(r.title, pageWidth / 2, MARGIN + 2, { align: 'center' });
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${L.name}: ${r.name}      ${L.course}: ${r.course}`, MARGIN, MARGIN + 10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${L.month}: ${r.month}`, pageWidth - MARGIN, MARGIN + 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`${L.tutor}: ${r.tutor}`, MARGIN, MARGIN + 15);
    let y = MARGIN + 20;
    const firstPage = doc.getNumberOfPages();
    for (const week of r.weeks) {
      const body: CellDef[][] = r.criteria.map((name, c) => [
        { content: name, styles: { fontStyle: 'bold', fontSize: 8 } },
        ...week.flatMap((d): CellDef[] =>
          d.holiday
            ? c === 0
              ? [
                  {
                    content: HOLIDAY_LABEL,
                    rowSpan: r.criteria.length,
                    styles: { halign: 'center', valign: 'middle', fontStyle: 'bold', fontSize: 9 },
                  },
                ]
              : []
            : [{ content: d.texts[c] }],
        ),
      ]);
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
        head: [[CRITERIA_HEADER, ...week.map((d) => d.header)]],
        body,
        theme: 'grid',
        rowPageBreak: 'avoid',
        // Pages after the first carry the student's name too
        didDrawPage: (data) => {
          if (data.pageNumber === firstPage) return;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(`${r.name} · ${r.month}`, pageWidth - MARGIN, MARGIN - 4, { align: 'right' });
        },
        styles: {
          font: 'helvetica',
          fontSize: 7,
          cellPadding: 1.5,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          textColor: [0, 0, 0],
          valign: 'top',
        },
        headStyles: {
          fillColor: [217, 217, 217],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        // Same widths in every week table, like the Word file
        columnStyles: {
          0: { cellWidth: 32 },
          ...Object.fromEntries([1, 2, 3, 4, 5].map((k) => [k, { cellWidth: (pageWidth - MARGIN * 2 - 32) / 5 }])),
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

/** Height of one strip of the quarter norms report: the A4 page is cut in three. */
const STRIP_HEIGHT = PAGE_HEIGHT / QUARTER_PER_PAGE;

/** Observaciones that fit their cell: smaller letters for a long text, and cut with "…" if it is still too long. */
function fitNote(doc: jsPDF, text: string, width: number): { lines: string[]; size: number } {
  for (const [size, max] of [
    [8, 2],
    [6.5, 3],
  ] as const) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width) as string[];
    if (lines.length <= max) return { lines, size };
  }
  const lines = (doc.splitTextToSize(text, width) as string[]).slice(0, 3);
  lines[2] = `${lines[2].replace(/\s*\S*$/, '')}…`;
  return { lines, size: 6.5 };
}

/** A black header cell with white bold text, like the paper form. */
function darkCell(doc: jsPDF, x: number, y: number, w: number, h: number, text: string, center = false): void {
  doc.setFillColor(0, 0, 0);
  doc.rect(x, y, w, h, 'FD');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(text, center ? x + w / 2 : x + 2, y + h / 2, { baseline: 'middle', align: center ? 'center' : 'left' });
  doc.setTextColor(0, 0, 0);
}

function drawQuarterStrip(doc: jsPDF, r: QuarterSheet, top: number): void {
  const L = QUARTER_LABELS;
  const left = MARGIN + 2;
  const width = PAGE_WIDTH - left * 2;
  const center = PAGE_WIDTH / 2;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);

  // Header: logo and school name on the left, term and title centred below
  const { left: logo } = getLogos();
  let textX = left;
  if (logo) {
    const height = 11;
    const w = (height * logo.width) / logo.height;
    doc.addImage(logo.uri, imageFormat(logo.uri) === 'png' ? 'PNG' : 'JPEG', left, top + 5, w, height, 'logo-left');
    textX = left + w + 3;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    [r.institution1, r.institution2].filter((t) => t.trim() !== ''),
    textX,
    top + 9,
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(r.term, center, top + 20, { align: 'center' });
  doc.setFontSize(9.5);
  doc.text(r.title, center, top + 25, { align: 'center', maxWidth: width });

  // Student box
  let y = top + 29;
  const rowH = 7;
  const labelW = 38;
  darkCell(doc, left, y, labelW, rowH, L.name);
  doc.rect(left + labelW, y, width - labelW, rowH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(r.name, left + labelW + 2, y + rowH / 2, { baseline: 'middle', maxWidth: width - labelW - 4 });
  y += rowH;
  const courseW = 52;
  const auxLabelW = 22;
  darkCell(doc, left, y, labelW, rowH, L.course);
  doc.rect(left + labelW, y, courseW, rowH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(r.course, left + labelW + 2, y + rowH / 2, { baseline: 'middle', maxWidth: courseW - 4 });
  darkCell(doc, left + labelW + courseW, y, auxLabelW, rowH, L.auxiliary);
  const auxX = left + labelW + courseW + auxLabelW;
  doc.rect(auxX, y, width - (auxX - left), rowH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(r.auxiliary, auxX + 2, y + rowH / 2, { baseline: 'middle', maxWidth: width - (auxX - left) - 4 });

  // Criteria table
  y += rowH + 4;
  const cols = [10, 62, 46, width - 10 - 62 - 46];
  const xs = cols.reduce<number[]>((acc, w, i) => [...acc, (acc[i] ?? left) + w], [left]);
  [L.number, L.criteria, L.level, L.notes].forEach((t, i) => darkCell(doc, xs[i], y, cols[i], rowH, t, i !== 1));
  y += rowH;
  const lineH = 10;
  r.rows.forEach((row, i) => {
    cols.forEach((w, k) => doc.rect(xs[k], y, w, lineH));
    const mid = y + lineH / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(String(i + 1), xs[0] + cols[0] / 2, mid, { baseline: 'middle', align: 'center' });
    doc.text(row.criterion, xs[1] + 2, mid, { baseline: 'middle', maxWidth: cols[1] - 4 });
    // Every level is printed and the chosen one is circled
    const step = cols[2] / r.levels.length;
    r.levels.forEach((level, k) => {
      const cx = xs[2] + step * (k + 0.5);
      doc.setFont('helvetica', level === row.grade ? 'bold' : 'normal');
      doc.text(level, cx, mid, { baseline: 'middle', align: 'center' });
      if (level === row.grade) doc.ellipse(cx, mid, level.length > 1 ? 4.6 : 3.4, 3.4);
    });
    if (row.note !== '') {
      doc.setFont('helvetica', 'normal');
      const { lines, size } = fitNote(doc, row.note, cols[3] - 4);
      doc.setFontSize(size);
      const lh = size * 0.42;
      doc.text(lines, xs[3] + 2, mid - ((lines.length - 1) * lh) / 2, { baseline: 'middle' });
    }
    y += lineH;
  });
}

/** Quarter norms report: one strip per student, three per A4 page, with dashed lines to cut them apart. */
export function buildQuarterPdf(sheets: QuarterSheet[]): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  sheets.forEach((r, i) => {
    const slot = i % QUARTER_PER_PAGE;
    if (i > 0 && slot === 0) doc.addPage();
    if (slot > 0) {
      doc.setLineDashPattern([2, 2], 0);
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.2);
      doc.line(4, slot * STRIP_HEIGHT, PAGE_WIDTH - 4, slot * STRIP_HEIGHT);
      doc.setLineDashPattern([], 0);
    }
    drawQuarterStrip(doc, r, slot * STRIP_HEIGHT + 3);
  });
  return new Uint8Array(doc.output('arraybuffer'));
}
