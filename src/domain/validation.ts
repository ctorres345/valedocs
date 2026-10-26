import { sameClass, type SchoolClass } from './model';
import { nameKey, collapseSpaces } from './text';

/** Problems when registering a class. The Spanish texts are built by the view, not the domain. */
export type ClassProblem =
  | { type: 'label-empty' }
  | { type: 'label-duplicate'; other: string }
  | { type: 'no-students' }
  | { type: 'duplicate-names'; names: string[] };

/** The already-registered class with the same year and section (one can be ignored by id when editing). */
export function duplicateClass(classes: SchoolClass[], label: string, exceptId?: string): SchoolClass | undefined {
  return classes.find((c) => c.id !== exceptId && sameClass(c.label, label));
}

/** Names that appear more than once in the list (spelled as in their first occurrence). */
export function duplicateNames(names: string[]): string[] {
  const seenMap = new Map<string, { text: string; times: number }>();
  for (const n of names) {
    const k = nameKey(n);
    if (k === '') continue;
    const v = seenMap.get(k);
    if (v) v.times++;
    else seenMap.set(k, { text: collapseSpaces(n), times: 1 });
  }
  return [...seenMap.values()].filter((v) => v.times > 1).map((v) => v.text);
}

/** If `name` is already in the list (ignoring position `exceptIndex`), returns how it is spelled there. */
export function duplicateName(names: string[], name: string, exceptIndex?: number): string | undefined {
  const k = nameKey(name);
  const i = names.findIndex((n, idx) => idx !== exceptIndex && nameKey(n) === k);
  return i >= 0 ? names[i] : undefined;
}

/** Checks the data of a new class before saving it; empty list = all good. */
export function validateNewClass(classes: SchoolClass[], label: string, names: string[]): ClassProblem[] {
  const problems: ClassProblem[] = [];
  if (collapseSpaces(label) === '') problems.push({ type: 'label-empty' });
  else {
    const same = duplicateClass(classes, label);
    if (same) problems.push({ type: 'label-duplicate', other: same.label });
  }
  const validOnes = names.filter((n) => collapseSpaces(n) !== '');
  if (validOnes.length === 0) problems.push({ type: 'no-students' });
  const duplicates = duplicateNames(validOnes);
  if (duplicates.length > 0) problems.push({ type: 'duplicate-names', names: duplicates });
  return problems;
}
