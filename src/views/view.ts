import type { SchoolClass } from '../domain/model';

/** The reports the app makes. */
export type ReportKind = 'conduct' | 'attendance' | 'norms';

/** A screen: its root element and, if needed, how to clean up when leaving. */
export interface View {
  el: HTMLElement;
  destroy?: () => void;
}

/** Classes the user removed from the blank sheets and the export (all are included by default). */
const excluded = new Set<string>();

export function isIncluded(id: string): boolean {
  return !excluded.has(id);
}
export function include(id: string, yes: boolean): void {
  if (yes) excluded.delete(id);
  else excluded.add(id);
}
export function includedClasses(classes: SchoolClass[]): SchoolClass[] {
  return classes.filter((c) => isIncluded(c.id));
}

export function goTo(route: string): void {
  location.hash = route;
}
