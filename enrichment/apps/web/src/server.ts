import { join } from 'path';
import {
  runEnrichment,
  mergeFiles,
  serializeEnrichedCsv,
  serializeMasterCsv,
} from '@enrichment/enricher';
import type { ProgressEvent, EnrichedRecord, MasterRecord } from '@enrichment/enricher';

const PORT = parseInt(process.env.PORT ?? '3001');
const PUBLIC_DIR = join(import.meta.dir, 'public');
const DATA_DIR = join(import.meta.dir, '..', '..', '..', 'data');

interface Job {
  events: ProgressEvent[];
  listeners: Set<(e: ProgressEvent) => void>;
  done: boolean;
  result: EnrichedRecord[] | null;
}

let lastMergedRecords: MasterRecord[] | null = null;
let lastMergedCsv: string | null = null;
let currentJob: Job | null = null;
let lastCsvResult: string | null = null;

async function readDataFile(name: string): Promise<string> {
  return Bun.file(join(DATA_DIR, name)).text();
}

async function handleMerge(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError('Invalid form data', 400);
  }

  const files = formData.getAll('files') as File[];
  if (files.length === 0) return jsonError('At least one file is required', 400);

  const inputs = await Promise.all(
    files.map(async f => ({ filename: f.name, content: await f.text() }))
  );

  const { records, stats } = mergeFiles(inputs);

  lastMergedRecords = records;
  lastMergedCsv = serializeMasterCsv(records);
  currentJob = null;
  lastCsvResult = null;

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleMergeDownload(): Response {
  if (!lastMergedCsv) return new Response('No merged data available', { status: 404 });
  return new Response(lastMergedCsv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="master.csv"',
    },
  });
}

async function handleEnrich(req: Request): Promise<Response> {
  if (!lastMergedRecords) {
    return jsonError('No merged data — complete Step 1 first', 400);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError('Invalid form data', 400);
  }

  const patternsFile = formData.get('patterns') as File | null;
  const patternsTxtContent = patternsFile
    ? await patternsFile.text()
    : await readDataFile('email-patterns.txt');

  const job: Job = { events: [], listeners: new Set(), done: false, result: null };
  currentJob = job;
  lastCsvResult = null;

  runEnrichment({
    masterRecords: lastMergedRecords,
    patternsTxtContent,
    onProgress(event) {
      job.events.push(event);
      job.listeners.forEach(fn => fn(event));
      if (event.type === 'complete') {
        job.done = true;
      }
    },
  })
    .then(records => {
      job.result = records;
      lastCsvResult = serializeEnrichedCsv(records);
    })
    .catch(err => {
      const errEvent: ProgressEvent = { type: 'error', message: (err as Error).message };
      job.events.push(errEvent);
      job.listeners.forEach(fn => fn(errEvent));
      job.done = true;
    });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleProgress(): Response {
  if (!currentJob) {
    return new Response('No active job', { status: 404 });
  }
  const job = currentJob;

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (text: string) => {
        if (!closed) {
          try { controller.enqueue(encoder.encode(text)); } catch { cleanup(); }
        }
      };

      const close = () => {
        if (!closed) {
          closed = true;
          cleanup();
          // Defer so Bun has returned the Response and chunked encoding is set up
          setTimeout(() => { try { controller.close(); } catch {} }, 0);
        }
      };

      const listener = (event: ProgressEvent) => {
        enqueue(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'complete' || (event.type === 'error' && event.index == null)) {
          job.listeners.delete(listener);
          close();
        }
      };

      const cleanup = () => {
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        job.listeners.delete(listener);
      };

      // Keep-alive comment every 8 s — must be shorter than Bun's idleTimeout
      heartbeat = setInterval(() => enqueue(': ping\n\n'), 8_000);

      // Replay buffered events to a late-connecting client
      let terminal = false;
      for (const e of job.events) {
        enqueue(`data: ${JSON.stringify(e)}\n\n`);
        if (e.type === 'complete' || (e.type === 'error' && e.index == null)) {
          terminal = true;
          break;
        }
      }

      if (terminal || job.done) {
        close();
      } else {
        job.listeners.add(listener);
      }
    },
    cancel() {
      closed = true;
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function handleDownload(): Response {
  if (!lastCsvResult) return new Response('No data available', { status: 404 });
  return new Response(lastCsvResult, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="enriched_master.csv"',
    },
  });
}

async function handleStatic(pathname: string): Promise<Response> {
  const filePath = join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response('Not Found', { status: 404 });
  return new Response(file);
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === 'POST' && pathname === '/merge') return handleMerge(req);
    if (req.method === 'GET'  && pathname === '/merge/download') return handleMergeDownload();
    if (req.method === 'POST' && pathname === '/enrich') return handleEnrich(req);
    if (req.method === 'GET'  && pathname === '/enrich/progress') return handleProgress();
    if (req.method === 'GET'  && pathname === '/download') return handleDownload();
    if (req.method === 'GET') return handleStatic(pathname);

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Enrichment server running at http://localhost:${PORT}`);
