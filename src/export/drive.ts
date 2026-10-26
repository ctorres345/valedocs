import { T } from '../ui/texts';
import { MIME_XLSX } from '../ui/dom';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const driveAvailable = (): boolean => CLIENT_ID !== '';

interface TokenResponse {
  access_token?: string;
  error?: string;
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
}
interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient: (c: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback: (e: { type?: string }) => void;
      }) => TokenClient;
    };
  };
}

export class DriveError extends Error {}

let scriptPromise: Promise<void> | null = null;
function loadGoogle(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client?hl=es';
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      scriptPromise = null;
      fail(new DriveError(T.driveError));
    };
    document.head.append(s);
  });
  return scriptPromise;
}

/** Loads the Google script when the export screen opens, so the click can open the popup without being blocked. */
export function preloadGoogle(): void {
  if (driveAvailable()) loadGoogle().catch(() => {});
}

function requestToken(): Promise<string> {
  return new Promise((ok, fail) => {
    const g = (window as unknown as { google?: GoogleGlobal }).google;
    if (!g) return fail(new DriveError(T.driveError));
    const client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => (r.access_token ? ok(r.access_token) : fail(new DriveError(T.driveCancelled))),
      error_callback: (e) =>
        fail(new DriveError(e.type === 'popup_failed_to_open' ? T.driveBlocked : T.driveCancelled)),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Uploads the Excel file to Drive, converting it to a Google Sheet, and returns its link. */
export async function uploadToDrive(bytes: Uint8Array, name: string): Promise<string> {
  await loadGoogle();
  const token = await requestToken();
  const boundary = `limite${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.spreadsheet' });
  const enc = new TextEncoder();
  const parts = [
    enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${MIME_XLSX}\r\n\r\n`,
    ),
    bytes,
    enc.encode(`\r\n--${boundary}--`),
  ];
  let response: Response;
  try {
    response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: new Blob(parts as BlobPart[]),
      },
    );
  } catch {
    throw new DriveError(T.driveError);
  }
  if (!response.ok) throw new DriveError(T.driveError);
  const json = (await response.json()) as { id?: string; webViewLink?: string };
  const link = json.webViewLink ?? (json.id ? `https://docs.google.com/spreadsheets/d/${json.id}/edit` : '');
  if (!link) throw new DriveError(T.driveError);
  return link;
}
