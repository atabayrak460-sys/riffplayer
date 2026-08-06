import { createReadStream } from 'fs';
import { mkdir, writeFile, access } from 'fs/promises';
import path from 'path';
import { parseFile } from 'music-metadata';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendError, SubsonicErrorCode } from '../response.js';

type Q = Record<string, string | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });

function getCoversDir(): string {
  return process.env.COVERS_DIR ?? path.join(process.cwd(), 'covers');
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * Normalise a raw MIME type string from an ID3/Vorbis tag before looking it up
 * in MIME_TO_EXT. Real-world files contain many variants:
 *   • 'image/jpg'  — technically invalid but produced by many taggers
 *   • 'IMAGE/JPEG' — uppercase from some Windows tools
 *   • 'image/jpeg; charset=utf-8' — params from some encoders
 *   • 'jpg'/'png'  — bare extension strings from ID3v2.2-era PIC frames
 */
function normalizeMime(raw: string): string {
  const s = raw.toLowerCase().split(';')[0].trim();
  if (s === 'image/jpg') return 'image/jpeg';
  if (s === 'jpg' || s === 'jpeg') return 'image/jpeg';
  if (s === 'png') return 'image/png';
  if (s === 'gif') return 'image/gif';
  if (s === 'webp') return 'image/webp';
  return s;
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findCachedAlbumArt(
  albumId: number,
  coversDir: string,
): Promise<{ filePath: string; mime: string } | null> {
  for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
    const candidate = path.join(coversDir, `al-${albumId}.${ext}`);
    if (await fileExists(candidate)) return { filePath: candidate, mime };
  }
  return null;
}

async function fetchFromCoverArtArchive(
  albumId: number,
  coversDir: string,
): Promise<{ filePath: string; mime: string } | null> {
  const album = getDb()
    .prepare('SELECT mbid FROM albums WHERE id = ?')
    .get(albumId) as { mbid: string | null } | undefined;
  if (!album?.mbid) return null;

  // CAA returns a redirect to the actual image; follow it
  const url = `https://coverartarchive.org/release/${album.mbid}/front-500`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
    const ext = MIME_TO_EXT[contentType] ?? 'jpg';
    const mime = contentType || 'image/jpeg';

    await mkdir(coversDir, { recursive: true });
    const cachePath = path.join(coversDir, `al-${albumId}.${ext}`);
    await writeFile(cachePath, Buffer.from(await res.arrayBuffer()));
    return { filePath: cachePath, mime };
  } catch {
    return null;
  }
}

// Coalesces concurrent requests for the same not-yet-cached album's cover
// art. Without this, several simultaneous requests for the same album (e.g.
// a grid view loading many albums at once, or a freshly emptied cache) would
// each independently re-parse the track file or re-fetch from Cover Art
// Archive and race to write the same cache file — not corruption, but
// wasted CPU and network. Checked-and-set synchronously (no `await` in
// between), so it's safe even for requests handled back to back.
const inFlightExtractions = new Map<number, Promise<{ filePath: string; mime: string } | null>>();

/** Primarily for tests — the number of album covers currently being
 * extracted, to verify concurrent requests for the same album coalesce into
 * a single in-flight entry rather than each starting their own. */
export function getInFlightExtractionCount(): number {
  return inFlightExtractions.size;
}

async function extractAndCacheAlbumArt(
  albumId: number,
  coversDir: string,
): Promise<{ filePath: string; mime: string } | null> {
  const inFlight = inFlightExtractions.get(albumId);
  if (inFlight) return inFlight;

  const promise = doExtractAndCacheAlbumArt(albumId, coversDir).finally(() => {
    inFlightExtractions.delete(albumId);
  });
  inFlightExtractions.set(albumId, promise);
  return promise;
}

async function doExtractAndCacheAlbumArt(
  albumId: number,
  coversDir: string,
): Promise<{ filePath: string; mime: string } | null> {
  const cached = await findCachedAlbumArt(albumId, coversDir);
  if (cached) return cached;

  // 1. Try embedded art in the first track
  const track = getDb()
    .prepare('SELECT path FROM tracks WHERE album_id = ? LIMIT 1')
    .get(albumId) as { path: string } | undefined;
  if (track) {
    try {
      const metadata = await parseFile(track.path, { skipCovers: false });
      const picture = metadata.common.picture?.[0];
      if (picture) {
        const mime = normalizeMime(picture.format);
        const ext = MIME_TO_EXT[mime];
        if (ext) {
          await mkdir(coversDir, { recursive: true });
          const cachePath = path.join(coversDir, `al-${albumId}.${ext}`);
          await writeFile(cachePath, picture.data);
          return { filePath: cachePath, mime };
        }
      }
    } catch {
      // fall through to Cover Art Archive
    }
  }

  // 2. Fetch from Cover Art Archive using album MBID
  return fetchFromCoverArtArchive(albumId, coversDir);
}

async function coverArtHandler(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
  const { id, f } = p(req);
  if (!id)
    return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  const db = getDb();

  // System-view covers ('sv-<key>') are keyed by the authenticated user, not
  // a numeric row id — every user has their own optional override per view.
  if (id.startsWith('sv-')) {
    const viewKey = id.slice(3);
    const userId = req.subsonicUser?.id;
    const row = userId
      ? (db
          .prepare('SELECT cover_path FROM system_view_settings WHERE user_id = ? AND view_key = ?')
          .get(userId, viewKey) as { cover_path: string | null } | undefined)
      : undefined;
    if (!row || !row.cover_path) {
      return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'No cover art' });
    }
    reply.header('Content-Type', mimeFromPath(row.cover_path));
    return reply.send(createReadStream(row.cover_path));
  }

  let itemType: 'album' | 'artist' | 'playlist';
  let itemId: number;

  if (id.startsWith('al-')) {
    itemType = 'album';
    itemId = Number(id.slice(3));
  } else if (id.startsWith('ar-')) {
    itemType = 'artist';
    itemId = Number(id.slice(3));
  } else if (id.startsWith('pl-')) {
    itemType = 'playlist';
    itemId = Number(id.slice(3));
  } else {
    itemType = 'album';
    itemId = Number(id);
  }

  if (!Number.isFinite(itemId) || itemId <= 0) {
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Invalid id' });
  }

  if (itemType === 'artist') {
    const artist = db
      .prepare('SELECT image_path FROM artists WHERE id = ?')
      .get(itemId) as { image_path: string | null } | undefined;
    if (!artist || !artist.image_path) {
      return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'No cover art' });
    }
    reply.header('Content-Type', mimeFromPath(artist.image_path));
    return reply.send(createReadStream(artist.image_path));
  }

  if (itemType === 'playlist') {
    const playlist = db
      .prepare('SELECT cover_path FROM playlists WHERE id = ?')
      .get(itemId) as { cover_path: string | null } | undefined;
    if (!playlist || !playlist.cover_path) {
      return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'No cover art' });
    }
    reply.header('Content-Type', mimeFromPath(playlist.cover_path));
    return reply.send(createReadStream(playlist.cover_path));
  }

  // Album: check manual cover_path first
  const album = db
    .prepare('SELECT cover_path FROM albums WHERE id = ?')
    .get(itemId) as { cover_path: string | null } | undefined;
  if (!album) {
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Album not found' });
  }

  if (album.cover_path) {
    reply.header('Content-Type', mimeFromPath(album.cover_path));
    return reply.send(createReadStream(album.cover_path));
  }

  // Fall back to embedded art, cached to disk
  const art = await extractAndCacheAlbumArt(itemId, getCoversDir());
  if (!art) {
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'No cover art found' });
  }

  reply.header('Content-Type', art.mime);
  return reply.send(createReadStream(art.filePath));
}

export async function coverArtPlugin(app: FastifyInstance): Promise<void> {
  app.route({ method: ['GET', 'POST'], url: '/getCoverArt.view', handler: coverArtHandler });
}
