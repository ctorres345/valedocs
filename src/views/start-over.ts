import { confirmDialog, notice } from '../ui/dom';
import { T } from '../ui/texts';
import { resetAll } from '../storage/store';

/** Asks for confirmation and, if accepted, deletes everything. Returns whether it was done. */
export async function confirmStartOver(): Promise<boolean> {
  if (!(await confirmDialog(T.resetTitle, T.resetText, T.resetConfirm, true))) return false;
  await resetAll();
  notice(T.resetDone, 'ok');
  return true;
}
