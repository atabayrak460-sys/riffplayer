import { createReadStream } from 'fs';
import { stat, open } from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendError, SubsonicErrorCode } from '../response.js';
import { fileContentType, fileSuffix } from '../serialize.js';
import { logPlay } from '../playHistory.js';

type Q = Record<string, string | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });

interface TrackRow {
  id: number;
  path: string;
  bitrate: number | null;
  size: number | null;
}

// Maps requested format → ffmpeg -f arg and MIME type
const TRANSCODE_FORMATS: Record<string, { ffmpegFmt: string; mime: string }> = {
  mp3:  { ffmpegFmt: 'mp3',  mime: 'audio/mpeg' },
  ogg:  { ffmpegFmt: 'ogg',  mime: 'audio/ogg' },
  opus: { ffmpegFmt: 'opus', mime: 'audio/ogg; codecs=opus' },
  aac:  { ffmpegFmt: 'adts', mime: 'audio/aac' },
  flac: { ffmpegFmt: 'flac', mime: 'audio/flac' },
  raw:  { ffmpegFmt: '',     mime: '' }, // sentinel: serve original
};

// ── Range parsing ─────────────────────────────────────────────────────────────

export function parseRange(
  header: string,
  fileSize: number,
): { start: number; end: number } | null {
  const m = header.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;

  const [, startStr, endStr] = m;

  if (!startStr && endStr) {
    // suffix range: bytes=-500 → last 500 bytes
    const len = Number(endStr);
    return { start: Math.max(0, fileSize - len), end: fileSize - 1 };
  }

  const start = Number(startStr);
  const end = endStr ? Math.min(Number(endStr), fileSize - 1) : fileSize - 1;
  if (start > end || start >= fileSize) return null;
  return { start, end };
}

// ── Direct file serve ─────────────────────────────────────────────────────────

async function serveFile(
  filePath: string,
  fileSize: number,
  contentType: string,
  rangeHeader: string | undefined,
  forceDownload: boolean,
  reply: FastifyReply,
): Promise<void> {
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', contentType);

  if (forceDownload) {
    reply.header(
      'Content-Disposition',
      `attachment; filename="${path.basename(filePath)}"`,
    );
  }

  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize);
    if (range) {
      const { start, end } = range;
      const length = end - start + 1;

      // Read the byte range into a Buffer so Fastify can set Content-Length
      // correctly (Fastify removes Content-Length for streams).
      // Audio clients request moderate chunks (≤5 MB), so memory pressure is low.
      const fh = await open(filePath, 'r');
      try {
        const buf = Buffer.alloc(length);
        await fh.read(buf, 0, length, start);
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        reply.send(buf);
      } finally {
        await fh.close();
      }
      return;
    }
  }

  // Full file: stream directly — Fastify will use chunked encoding
  reply.send(createReadStream(filePath));
}

// ── ffmpeg transcoded serve ───────────────────────────────────────────────────

function serveTranscoded(
  filePath: string,
  targetFmt: string,
  maxBitRate: number,
  reply: FastifyReply,
): void {
  const fmt = TRANSCODE_FORMATS[targetFmt] ?? TRANSCODE_FORMATS.mp3;

  const args = [
    '-i', filePath,
    '-f', fmt.ffmpegFmt,
    ...(maxBitRate > 0 ? ['-b:a', `${maxBitRate}k`] : []),
    '-vn',        // drop any embedded video/cover stream
    '-v', 'error',
    'pipe:1',
  ];

  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  ff.on('error', (err) => {
    reply.log.error({ err }, '[stream] ffmpeg failed to start');
    if (!reply.sent) reply.code(500).send('Transcoding unavailable');
  });

  reply.header('Content-Type', fmt.mime);
  reply.send(ff.stdout);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function streamHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id, maxBitRate = '0', format, f } = p(req);
  if (!id)
    return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  const db = getDb();
  const track = db
    .prepare('SELECT id, path, bitrate, size FROM tracks WHERE id = ?')
    .get(Number(id)) as TrackRow | undefined;
  if (!track)
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Track not found' });

  let fileSize: number;
  try {
    fileSize = (await stat(track.path)).size;
  } catch {
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'File not found on disk' });
  }

  // Log the play now that we know the track and file exist
  logPlay(req.subsonicUser!.id, track.id, p(req).c);

  const nativeSuffix = fileSuffix(track.path);
  const requestedFmt = format?.toLowerCase();
  const requestedBitRate = Number(maxBitRate);

  const needsTranscode =
    (requestedFmt && requestedFmt !== 'raw' && requestedFmt !== nativeSuffix) ||
    (requestedBitRate > 0 && track.bitrate != null && track.bitrate > requestedBitRate);

  if (needsTranscode) {
    serveTranscoded(track.path, requestedFmt ?? 'mp3', requestedBitRate, reply);
  } else {
    await serveFile(
      track.path,
      fileSize,
      fileContentType(track.path),
      req.headers.range,
      false,
      reply,
    );
  }
}

async function downloadHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id, f } = p(req);
  if (!id)
    return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  const track = getDb()
    .prepare('SELECT path, size FROM tracks WHERE id = ?')
    .get(Number(id)) as { path: string; size: number | null } | undefined;
  if (!track)
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Track not found' });

  let fileSize: number;
  try {
    fileSize = (await stat(track.path)).size;
  } catch {
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'File not found on disk' });
  }

  await serveFile(
    track.path,
    fileSize,
    fileContentType(track.path),
    req.headers.range,
    true,
    reply,
  );
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export async function streamPlugin(app: FastifyInstance): Promise<void> {
  app.route({ method: ['GET', 'POST'], url: '/stream.view',   handler: streamHandler });
  app.route({ method: ['GET', 'POST'], url: '/download.view', handler: downloadHandler });
}
