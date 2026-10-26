/// <reference lib="webworker" />
import { readNames } from './read-names';
import { cleanWorkbook } from './clean';

export type WorkerRequest = { id: number; type: 'read' | 'clean'; bytes: Uint8Array };
export type WorkerResponse =
  | { id: number; ok: true; type: 'read'; classes: ReturnType<typeof readNames> }
  | { id: number; ok: true; type: 'clean'; result: ReturnType<typeof cleanWorkbook> }
  | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, type, bytes } = e.data;
  try {
    if (type === 'read') {
      const classes = readNames(bytes);
      (self as unknown as Worker).postMessage({ id, ok: true, type, classes } satisfies WorkerResponse);
    } else {
      const result = cleanWorkbook(bytes);
      (self as unknown as Worker).postMessage({ id, ok: true, type, result } satisfies WorkerResponse, [
        result.bytes.buffer,
      ]);
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
