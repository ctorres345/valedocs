import { zipSync } from 'fflate';
import type { AttendanceMonth, SchoolClass, Settings, Student } from '../domain/model';
import { buildNormsReport, normsFileName, type NormsReport } from '../domain/norms-layout';
import { buildNormsDocx } from './build-docx';
import { buildNormsPdf } from './build-pdf';

export type NormsFormat = 'docx' | 'pdf';
export type NormsGrouping = 'single' | 'zip';

export interface NormsDownload {
  bytes: Uint8Array;
  /** File name with extension. */
  name: string;
}

/**
 * The file to download for some students of one class and month: one document with all of them, or a zip
 * with one document per student.
 */
export function buildNormsDownload(
  schoolClass: SchoolClass,
  am: AttendanceMonth,
  settings: Settings,
  students: Student[],
  format: NormsFormat,
  grouping: NormsGrouping,
): NormsDownload {
  const build = (reports: NormsReport[]) => (format === 'docx' ? buildNormsDocx(reports) : buildNormsPdf(reports));
  const base = normsFileName(schoolClass, am, null);
  const reportOf = (s: Student) => buildNormsReport(schoolClass, s, settings, am);
  if (grouping === 'single') {
    return {
      bytes: build(students.map(reportOf)),
      name: `${base}.${format}`,
    };
  }
  const files: Record<string, Uint8Array> = {};
  for (const s of students) files[`${normsFileName(schoolClass, am, s)}.${format}`] = build([reportOf(s)]);
  // The documents are already compressed: storing them avoids a slow, pointless deflate
  return { bytes: zipSync(files, { level: 0 }), name: `${base}.zip` };
}
