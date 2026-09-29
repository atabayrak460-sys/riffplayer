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
  replaygain_track: number | null;
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

// ── Content-Disposition ─────────────────────────────────────────────────────

// Node's raw HTTP header setter only accepts Latin-1 bytes — a filename
// with any other character (e.g. Turkish ı/ş/ğ/ü/ö/ç, or anything outside
// that range) throws ERR_INVALID_CHAR and 500s the whole request. RFC 6266
// fixes this with two parameters: a sanitized ASCII `filename` for clients
// that don't understand the extended form, and a UTF-8-percent-encoded
// `filename*` for those that do (virtually everything modern, including
// this app's own mobile/web clients).
function contentDispositionHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// ── Direct file serve ─────────────────────────────────────────────────────────

async function serveFile(
  filePath: string,
  fileSize: number,
  contentType: string,
  rangeHeader: string | undefined,
  forceDownload: boolean,
  reply: FastifyReply,
): Promise<FastifyReply> {
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', contentType);

  if (forceDownload) {
    reply.header('Content-Disposition', contentDispositionHeader(path.basename(filePath)));
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
        return reply.send(buf);
      } finally {
        await fh.close();
      }
    }
  }

  // Full file: stream directly — Fastify will use chunked encoding
  return reply.send(createReadStream(filePath));
}

// ── ffmpeg transcoded serve ───────────────────────────────────────────────────

function serveTranscoded(
  filePath: string,
  targetFmt: string,
  maxBitRate: number,
  reply: FastifyReply,
  replayGainDb: number | null = null,
): FastifyReply {
  const fmt = TRANSCODE_FORMATS[targetFmt] ?? TRANSCODE_FORMATS.mp3;

  // Combine replaygain gain + optional target normalisation to -14 LUFS standard
  const audioFilters: string[] = [];
  if (replayGainDb != null) audioFilters.push(`volume=${replayGainDb}dB`);

  const args = [
    '-i', filePath,
    '-f', fmt.ffmpegFmt,
    ...(maxBitRate > 0 ? ['-b:a', `${maxBitRate}k`] : []),
    ...(audioFilters.length ? ['-af', audioFilters.join(',')] : []),
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
  return reply.send(ff.stdout);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function streamHandler(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
  const { id, maxBitRate = '0', format, f } = p(req);
  if (!id)
    return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  const db = getDb();
  const track = db
    .prepare('SELECT id, path, bitrate, size, replaygain_track FROM tracks WHERE id = ?')
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

  // Apply per-user transcode preferences as defaults when client didn't specify
  const userPrefs = db
    .prepare('SELECT transcode_format, transcode_bitrate FROM user_preferences WHERE user_id = ?')
    .get(req.subsonicUser!.id) as { transcode_format: string | null; transcode_bitrate: number | null } | undefined;

  const nativeSuffix = fileSuffix(track.path);
  const requestedFmt = format?.toLowerCase() ?? userPrefs?.transcode_format ?? undefined;
  const requestedBitRate = Number(maxBitRate) || userPrefs?.transcode_bitrate || 0;

  const needsTranscode =
    (requestedFmt && requestedFmt !== 'raw' && requestedFmt !== nativeSuffix) ||
    (requestedBitRate > 0 && track.bitrate != null && track.bitrate > requestedBitRate);

  if (needsTranscode) {
    return serveTranscoded(track.path, requestedFmt ?? 'mp3', requestedBitRate, reply, track.replaygain_track);
  }
  return serveFile(
    track.path,
    fileSize,
    fileContentType(track.path),
    req.headers.range,
    false,
    reply,
  );
}

async function downloadHandler(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
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

  return serveFile(
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
