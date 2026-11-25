import { getAdminContext } from '@/lib/admin';
import { serverEnv } from '@/lib/env';
import { describeExtractionError, streamMenuExtraction, type MenuFile } from '@/lib/menu-import/extract';
import {
  IMPORT_IMAGE_TYPES,
  IMPORT_MAX_FILES,
  IMPORT_MAX_UPLOAD_BYTES,
  IMPORT_PDF_TYPE,
  type ImportEvent,
} from '@/lib/menu-import/limits';
import { toImportedMenu } from '@/lib/menu-import/schema';

/** Reading a long menu takes a minute or more. 300s is the ceiling on Vercel's Hobby plan with Fluid compute. */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES: readonly string[] = [...IMPORT_IMAGE_TYPES, IMPORT_PDF_TYPE];
/** Multipart framing adds a little to what the browser measured. */
const UPLOAD_MARGIN_BYTES = 200_000;
const PROGRESS_INTERVAL_MS = 800;
/** Send something at least this often so no proxy drops the connection while the model is thinking. */
const KEEP_ALIVE_MS = 10_000;

function refuse(status: number, message: string) {
  return Response.json({ error: { message } }, { status });
}

/**
 * POST /api/admin/menu/import
 * Takes photos or a PDF of a printed menu and streams back what the AI reads, as one JSON object per line:
 * progress while it works, then either the menu for review or an error. Nothing is saved here.
 */
export async function POST(request: Request) {
  const admin = await getAdminContext();
  if (admin.status === 'signed-out') return refuse(401, 'Sign in again to import a menu.');
  if (admin.status !== 'ok') return refuse(403, 'Only a venue manager can import a menu.');

  const apiKey = serverEnv.ANTHROPIC_API_KEY;
  if (!apiKey) return refuse(503, 'Menu import is not switched on for this site yet.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    console.error('Menu import upload could not be read:', err);
    return refuse(400, 'Those files could not be uploaded. Please try again.');
  }

  const uploads = form.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (uploads.length === 0) return refuse(400, 'Add at least one photo or PDF of the menu.');
  if (uploads.length > IMPORT_MAX_FILES) return refuse(400, `Import up to ${IMPORT_MAX_FILES} pages at a time.`);
  if (uploads.some((file) => !ALLOWED_TYPES.includes(file.type))) {
    return refuse(400, 'Use photos (JPG or PNG) or a PDF.');
  }
  const totalBytes = uploads.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > IMPORT_MAX_UPLOAD_BYTES + UPLOAD_MARGIN_BYTES) {
    return refuse(413, 'Those files are too large. Import fewer pages at a time.');
  }

  const files: MenuFile[] = await Promise.all(
    uploads.map(async (file) => ({
      mediaType: file.type,
      base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
    }))
  );

  // Stops the AI call (and its cost) as soon as the owner cancels or closes the page.
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSentAt = 0;
      const send = (event: ImportEvent) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          lastSentAt = Date.now();
        } catch (err) {
          console.warn('Menu import client is no longer listening:', err);
        }
      };

      let answer = '';
      let reportedItems = -1;
      const reportProgress = () => {
        // "unsure" is the last field of every item, so counting it counts finished items.
        const items = (answer.match(/"unsure"\s*:/g) ?? []).length;
        if (items !== reportedItems || Date.now() - lastSentAt > KEEP_ALIVE_MS) {
          reportedItems = items;
          send({ type: 'progress', items });
        }
      };
      reportProgress();
      const ticker = setInterval(reportProgress, PROGRESS_INTERVAL_MS);

      try {
        const stream = streamMenuExtraction({
          apiKey,
          files,
          venueCurrency: admin.venue.currency,
          signal: abort.signal,
        });
        stream.on('text', (delta) => {
          answer += delta;
        });
        // Noted as it arrives: a cut-off answer is not valid JSON, so finalMessage() throws before it can be read there.
        let ranOutOfRoom = false;
        stream.on('streamEvent', (event) => {
          if (event.type === 'message_delta' && event.delta.stop_reason === 'max_tokens') ranOutOfRoom = true;
        });

        let message: Awaited<ReturnType<typeof stream.finalMessage>>;
        try {
          message = await stream.finalMessage();
        } catch (err) {
          if (!ranOutOfRoom) throw err;
          console.error('Menu import answer was cut off at the token limit:', err);
          send({ type: 'error', message: 'This menu is too long to read in one go. Import a few pages at a time.' });
          return;
        }

        if (message.stop_reason === 'refusal') {
          console.error('Menu import was declined by the model:', message.stop_details);
          send({ type: 'error', message: 'The AI could not process those files. Try different photos.' });
        } else if (message.stop_reason === 'max_tokens') {
          send({ type: 'error', message: 'This menu is too long to read in one go. Import a few pages at a time.' });
        } else if (!message.parsed_output) {
          console.error('Menu import returned an answer that did not match the expected shape.');
          send({ type: 'error', message: 'The menu could not be read. Please try again.' });
        } else {
          const menu = toImportedMenu(message.parsed_output);
          if (menu.categories.length === 0) {
            send({ type: 'error', message: menu.notes[0] ?? 'No menu items were found. Try a clearer photo.' });
          } else {
            send({ type: 'result', menu });
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) console.error('Menu import failed:', err);
        send({ type: 'error', message: describeExtractionError(err) });
      } finally {
        clearInterval(ticker);
        try {
          controller.close();
        } catch (err) {
          console.warn('Menu import stream was already closed:', err);
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
