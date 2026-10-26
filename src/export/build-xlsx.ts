import ExcelJS from 'exceljs';
import { shortName, type Settings, type SchoolClass } from '../domain/model';
import {
  ATTENDANCE_NAME_WIDTH,
  WORKSHOP_HEADER,
  WORKSHOP_WIDTH,
  DAY_WIDTH,
  OBSERVATIONS_HEADER,
  OBSERVATIONS_WIDTH,
  buildAttendanceReport,
  titleSplit,
  type AttendanceReport,
} from '../domain/attendance-layout';
import { classesWithMonth } from '../domain/attendance';
import {
  CONSOLIDATED_GROUP_HEADER,
  CONSOLIDATED_NAME_WIDTH,
  COUNTED_CODES,
  COUNT_WIDTH,
  FIRST_COUNT_COL,
  TOTAL_CODES,
  TOTAL_HEADER,
  buildConsolidatedReport,
  countColumns,
  rowCells,
  type ConsolidatedReport,
} from '../domain/consolidated-layout';
import {
  NAME_WIDTH,
  GRADE_WIDTH,
  NUMBER_WIDTH,
  buildReport,
  columnHeader,
  NAME_HEADER,
  NUMBER_HEADER,
  type Report,
} from '../domain/report-layout';
import { base64Of, imageFormat, getLogos } from '../storage/logos';

const FONT_NAME = 'Calibri';
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const center: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

function sheetName(base: string, used: Set<string>): string {
  let name = base.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Clase';
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 27)} (${n++})`;
  used.add(name.toLowerCase());
  return name;
}

type Logos = { left: number | null; right: number | null };

/** Writes a (merged) centered text cell; returns the cell. */
function textWriter(ws: ExcelJS.Worksheet) {
  return (row: number, col: number, value: string, size: number, bold: boolean, toCol = col): ExcelJS.Cell => {
    if (toCol > col) ws.mergeCells(row, col, row, toCol);
    const c = ws.getCell(row, col);
    c.value = value;
    c.font = { name: FONT_NAME, size, bold };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    return c;
  };
}

/** Puts the school logos on the sides of the header (only the ones that have been loaded). */
function addLogos(ws: ExcelJS.Worksheet, logos: Logos, lastCol: number, lastColWidth: number, top = 0): void {
  const lg = getLogos();
  if (logos.left !== null && lg.left) {
    const height = 42;
    ws.addImage(logos.left, {
      tl: { col: 0.05, row: top + 0.1 },
      ext: { width: Math.round((height * lg.left.width) / lg.left.height), height: height },
    });
  }
  if (logos.right !== null && lg.right) {
    const height = 40;
    const width = Math.round((height * lg.right.width) / lg.right.height);
    const lastColPx = Math.round(lastColWidth * 7 + 5);
    ws.addImage(logos.right, {
      tl: { col: lastCol - 1 + Math.max(0, (lastColPx - width) / lastColPx), row: top + 0.1 },
      ext: { width: width, height: height },
    });
  }
}

function addSheet(wb: ExcelJS.Workbook, r: Report, name: string, logos: Logos): void {
  const n = r.columns.length;
  const lastCol = 2 + n;
  const ws = wb.addWorksheet(name, {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });

  ws.getColumn(1).width = NUMBER_WIDTH;
  ws.getColumn(2).width = NAME_WIDTH;
  for (let c = 3; c <= lastCol; c++) ws.getColumn(c).width = GRADE_WIDTH;

  const text = textWriter(ws);

  // Institutional header (logos on the sides)
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 8;
  text(1, 2, r.institution1, 12, true);
  text(2, 2, r.institution2, 12, true);
  text(4, 1, r.title1, 13, true, lastCol);
  ws.getRow(4).height = 19;
  if (r.title2.trim() !== '') {
    text(5, 1, r.title2, 13, true, lastCol);
    ws.getRow(5).height = 19;
  } else {
    ws.getRow(5).height = 4;
  }
  text(6, 1, r.term, 14, true, lastCol);
  ws.getRow(6).height = 21;
  text(7, 1, r.label, 14, true, 2);
  text(7, 3, r.tutor, 14, true, lastCol);
  ws.getRow(7).height = 21;
  ws.getRow(8).height = 8.25;

  addLogos(ws, logos, lastCol, GRADE_WIDTH);

  // Table header: every column is one cell merged over both header rows (like her original template)
  const headerCell = (col: number, value: string): void => {
    ws.mergeCells(9, col, 10, col);
    const c = ws.getCell(9, col);
    c.value = value;
    c.font = { name: FONT_NAME, size: 11, bold: true };
    c.alignment = center;
    for (const row of [9, 10]) ws.getCell(row, col).border = thinBorder;
  };
  headerCell(1, NUMBER_HEADER);
  headerCell(2, NAME_HEADER);
  r.columns.forEach((col, k) => headerCell(3 + k, columnHeader(col)));
  ws.getRow(9).height = 18;
  ws.getRow(10).height = 18;

  // Students
  r.rows.forEach((f, i) => {
    const row = 11 + i;
    ws.getRow(row).height = 18.75;
    const num = ws.getCell(row, 1);
    num.value = f.position;
    num.font = { name: FONT_NAME, size: 12 };
    num.alignment = { horizontal: 'center', vertical: 'middle' };
    num.border = thinBorder;
    const nameCell = ws.getCell(row, 2);
    nameCell.value = f.name;
    nameCell.font = { name: FONT_NAME, size: 12 };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
    nameCell.border = thinBorder;
    if (f.note !== '') {
      ws.mergeCells(row, 3, row, lastCol);
      const o = ws.getCell(row, 3);
      o.value = f.note;
      o.font = { name: FONT_NAME, size: 12, bold: true };
      o.alignment = center;
      for (let c = 3; c <= lastCol; c++) ws.getCell(row, c).border = thinBorder;
    } else {
      f.grades.forEach((grade, k) => {
        const c = ws.getCell(row, 3 + k);
        c.value = grade === '' ? null : grade;
        c.font = { name: FONT_NAME, size: 14 };
        c.alignment = center;
        c.border = thinBorder;
      });
    }
  });
}

function newWorkbook(): { wb: ExcelJS.Workbook; logos: Logos } {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'valedocs';
  wb.created = new Date();
  const lg = getLogos();
  const logos = {
    left: lg.left ? wb.addImage({ base64: base64Of(lg.left.uri), extension: imageFormat(lg.left.uri) }) : null,
    right: lg.right ? wb.addImage({ base64: base64Of(lg.right.uri), extension: imageFormat(lg.right.uri) }) : null,
  };
  return { wb, logos };
}

async function toBytes(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Generates a new, light workbook: one sheet per class, in the layout of her report. */
export async function buildWorkbook(classes: SchoolClass[], settings: Settings, blank = false): Promise<Uint8Array> {
  const { wb, logos } = newWorkbook();
  const used = new Set<string>();
  for (const schoolClass of classes) {
    addSheet(wb, buildReport(schoolClass, settings, blank), sheetName(shortName(schoolClass.label), used), logos);
  }
  return toBytes(wb);
}

function addAttendanceSheet(wb: ExcelJS.Workbook, r: AttendanceReport, name: string, logos: Logos): void {
  const d = r.days.length;
  const { titleEnd, lastCol } = titleSplit(d);
  const ws = wb.addWorksheet(name, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = NUMBER_WIDTH;
  ws.getColumn(2).width = WORKSHOP_WIDTH;
  ws.getColumn(3).width = ATTENDANCE_NAME_WIDTH;
  for (let c = 4; c < lastCol; c++) ws.getColumn(c).width = DAY_WIDTH;
  ws.getColumn(lastCol).width = OBSERVATIONS_WIDTH;

  const text = textWriter(ws);
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;
  text(1, 3, r.institution1, 12, true);
  text(2, 3, r.institution2, 12, true);
  text(3, 1, r.term, 12, true, lastCol);
  ws.getRow(3).height = 19;
  text(4, 1, r.label, 12, true, 3);
  text(4, 4, r.title, 12, true, titleEnd);
  if (titleEnd < lastCol) text(4, titleEnd + 1, r.tutor, 12, true, lastCol);
  ws.getRow(4).height = 19;
  if (r.uniformNote !== '' && titleEnd < lastCol) text(5, titleEnd + 1, r.uniformNote, 11, true, lastCol);
  ws.getRow(5).height = r.uniformNote !== '' ? 17 : 6;
  addLogos(ws, logos, lastCol, OBSERVATIONS_WIDTH);

  const header = (col: number, value: string | number, size = 10): void => {
    const c = ws.getCell(6, col);
    c.value = value;
    c.font = { name: FONT_NAME, size, bold: true };
    c.alignment = center;
    c.border = thinBorder;
  };
  header(1, NUMBER_HEADER, 11);
  header(2, WORKSHOP_HEADER, 9);
  header(3, NAME_HEADER, 11);
  r.days.forEach((day, k) => header(4 + k, day, 9));
  header(lastCol, OBSERVATIONS_HEADER, 9);
  ws.getRow(6).height = 24;

  r.rows.forEach((f, i) => {
    const row = 7 + i;
    ws.getRow(row).height = 17;
    const num = ws.getCell(row, 1);
    num.value = f.position;
    num.font = { name: FONT_NAME, size: 11 };
    num.alignment = { horizontal: 'center', vertical: 'middle' };
    num.border = thinBorder;
    const workshopCell = ws.getCell(row, 2);
    workshopCell.value = f.workshop === '' ? null : f.workshop;
    workshopCell.font = { name: FONT_NAME, size: 9 };
    workshopCell.alignment = center;
    workshopCell.border = thinBorder;
    const nameCell = ws.getCell(row, 3);
    nameCell.value = f.name;
    nameCell.font = { name: FONT_NAME, size: 11 };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
    nameCell.border = thinBorder;
    if (f.note !== '') {
      ws.mergeCells(row, 4, row, lastCol);
      const o = ws.getCell(row, 4);
      o.value = f.note;
      o.font = { name: FONT_NAME, size: 11, bold: true };
      o.alignment = center;
      for (let c = 4; c <= lastCol; c++) ws.getCell(row, c).border = thinBorder;
      return;
    }
    f.marks.forEach((mark, k) => {
      const c = ws.getCell(row, 4 + k);
      c.value = mark === '' ? null : mark;
      c.font = { name: FONT_NAME, size: 9 };
      c.alignment = center;
      c.border = thinBorder;
    });
    const o = ws.getCell(row, lastCol);
    o.value = f.summary === '' ? null : f.summary;
    o.font = { name: FONT_NAME, size: 9 };
    o.alignment = center;
    o.border = thinBorder;
  });
}

/** One sheet per class that has `month` opened, in the layout of her attendance report. */
export async function buildAttendanceWorkbook(
  classes: SchoolClass[],
  month: string,
  settings: Settings,
  blank = false,
): Promise<Uint8Array> {
  const { wb, logos } = newWorkbook();
  const used = new Set<string>();
  for (const { schoolClass, month: am } of classesWithMonth(classes, month)) {
    const report = buildAttendanceReport(schoolClass, settings, am, blank);
    addAttendanceSheet(wb, report, sheetName(shortName(schoolClass.label), used), logos);
  }
  return toBytes(wb);
}

/** A sheet for the consolidated report; `oneClassPerPage` lets a sheet holding several classes print over several pages. */
function addConsolidatedWorksheet(wb: ExcelJS.Workbook, name: string, monthCount: number, oneClassPerPage: boolean) {
  const lastCol = FIRST_COUNT_COL - 1 + countColumns(monthCount);
  const ws = wb.addWorksheet(name, {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: oneClassPerPage ? 1 : 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = NUMBER_WIDTH;
  ws.getColumn(2).width = CONSOLIDATED_NAME_WIDTH;
  for (let c = FIRST_COUNT_COL; c <= lastCol; c++) ws.getColumn(c).width = COUNT_WIDTH;
  return ws;
}

/** Writes the block of one class starting below row `top`; returns the last row it used. */
function writeConsolidatedBlock(ws: ExcelJS.Worksheet, r: ConsolidatedReport, logos: Logos, top: number): number {
  const per = COUNTED_CODES.length;
  const lastCol = FIRST_COUNT_COL - 1 + countColumns(r.months.length);
  const totalsCol = FIRST_COUNT_COL + r.months.length * per;
  const text = textWriter(ws);
  ws.getRow(top + 1).height = 20;
  ws.getRow(top + 2).height = 20;
  text(top + 1, 2, r.institution1, 12, true);
  text(top + 2, 2, r.institution2, 12, true);
  ws.getRow(top + 3).height = 10;
  text(top + 4, 1, r.title, 13, true, lastCol);
  ws.getRow(top + 4).height = 20;
  ws.getRow(top + 5).height = 8;
  addLogos(ws, logos, lastCol, COUNT_WIDTH, top);

  const header = (row: number, col: number, value: string, size: number, toRow = row, toCol = col): void => {
    if (toRow > row || toCol > col) ws.mergeCells(row, col, toRow, toCol);
    const c = ws.getCell(row, col);
    c.value = value;
    c.font = { name: FONT_NAME, size, bold: true };
    c.alignment = center;
    for (let y = row; y <= toRow; y++) for (let x = col; x <= toCol; x++) ws.getCell(y, x).border = thinBorder;
  };
  text(top + 6, 1, r.label, 13, true, 2);
  if (r.months.length > 0) header(top + 6, FIRST_COUNT_COL, CONSOLIDATED_GROUP_HEADER, 11, top + 6, totalsCol - 1);
  header(top + 6, totalsCol, TOTAL_HEADER, 11, top + 7, lastCol);
  header(top + 7, 1, NUMBER_HEADER, 11, top + 8);
  header(top + 7, 2, NAME_HEADER, 11, top + 8);
  r.months.forEach((month, m) => {
    const col = FIRST_COUNT_COL + m * per;
    header(top + 7, col, month, 9, top + 7, col + per - 1);
    COUNTED_CODES.forEach((code, k) => header(top + 8, col + k, code, 10));
  });
  TOTAL_CODES.forEach((code, k) => header(top + 8, totalsCol + k, code, 9));
  [6, 7, 8].forEach((row) => (ws.getRow(top + row).height = 17));

  r.rows.forEach((f, i) => {
    const row = top + 9 + i;
    ws.getRow(row).height = 17;
    const num = ws.getCell(row, 1);
    num.value = f.position;
    num.font = { name: FONT_NAME, size: 11 };
    num.alignment = { horizontal: 'center', vertical: 'middle' };
    num.border = thinBorder;
    const nameCell = ws.getCell(row, 2);
    nameCell.value = f.name;
    nameCell.font = { name: FONT_NAME, size: 11 };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
    nameCell.border = thinBorder;
    const { values, note } = rowCells(f);
    values.forEach((v, k) => {
      const c = ws.getCell(row, FIRST_COUNT_COL + k);
      c.value = v === '' ? null : Number(v);
      // Totals in bold, like her report
      c.font = { name: FONT_NAME, size: 11, bold: FIRST_COUNT_COL + k >= totalsCol };
      c.alignment = center;
      c.border = thinBorder;
    });
    if (note) {
      const start = FIRST_COUNT_COL + note.start;
      ws.mergeCells(row, start, row, start + note.span - 1);
      const o = ws.getCell(row, start);
      o.value = f.note;
      o.font = { name: FONT_NAME, size: 10, bold: true };
      o.alignment = center;
      for (let c = start; c < start + note.span; c++) ws.getCell(row, c).border = thinBorder;
    }
  });
  return top + 8 + r.rows.length;
}

/** Sheet name of the consolidated report when all classes share one sheet. */
export const CONSOLIDATED_SHEET = 'Consolidado';
/** Empty rows between two classes stacked in one sheet. */
const BLOCK_GAP = 3;

/**
 * Consolidated absences and tardies, with a group of columns per chosen month: one sheet per class, or with
 * `oneSheet` every class stacked in a single sheet (like her original file) with a page break between classes.
 */
export async function buildConsolidatedWorkbook(
  classes: SchoolClass[],
  months: string[],
  settings: Settings,
  oneSheet = false,
): Promise<Uint8Array> {
  const { wb, logos } = newWorkbook();
  const used = new Set<string>();
  const shared = oneSheet ? addConsolidatedWorksheet(wb, CONSOLIDATED_SHEET, months.length, false) : null;
  let top = 0;
  classes.forEach((schoolClass, i) => {
    const report = buildConsolidatedReport(schoolClass, settings, months);
    if (!shared) {
      const ws = addConsolidatedWorksheet(wb, sheetName(shortName(schoolClass.label), used), months.length, true);
      writeConsolidatedBlock(ws, report, logos, 0);
      return;
    }
    const last = writeConsolidatedBlock(shared, report, logos, top);
    if (i < classes.length - 1) shared.getRow(last).addPageBreak();
    top = last + BLOCK_GAP;
  });
  return toBytes(wb);
}
