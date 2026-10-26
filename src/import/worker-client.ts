import type { ImportedClass } from './read-names';
import type { CleanResult } from './clean';
import type { WorkerRequest, WorkerResponse } from './worker';
import { T } from '../ui/texts';

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, { ok: (r: WorkerResponse & { ok: true }) => void; fail: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.ok(e.data);
    else p.fail(new Error(e.data.error));
  };
  worker.onerror = () => {
    const all = [...pending.values()];
    pending.clear();
    worker = null;
    all.forEach((p) => p.fail(new Error('WORKER')));
  };
  return worker;
}

function request(type: WorkerRequest['type'], bytes: Uint8Array): Promise<WorkerResponse & { ok: true }> {
  return new Promise((ok, fail) => {
    const id = nextRequestId++;
    pending.set(id, { ok, fail });
    getWorker().postMessage({ id, type, bytes } satisfies WorkerRequest, [bytes.buffer]);
  });
}

/** Translates technical errors into Spanish messages for the end user. */
export function errorMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : '';
  if (m === 'NOT_EXCEL' || /invalid zip|unexpected eof|end of central/i.test(m)) return T.notExcel;
  return T.generalError;
}

export async function readList(file: File): Promise<ImportedClass[]> {
  if (/\.xls$/i.test(file.name)) throw new Error('LEGACY_XLS');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const r = await request('read', bytes);
  return r.type === 'read' ? r.classes : [];
}

export async function cleanFile(file: File): Promise<CleanResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const r = await request('clean', bytes);
  if (r.type !== 'clean') throw new Error('RESPONSE');
  return r.result;
}
