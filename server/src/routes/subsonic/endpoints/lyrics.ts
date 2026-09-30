import { readFile } from 'fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendOk, sendError, SubsonicErrorCode } from '../response.js';
import { xmlTag } from '../serialize.js';
import { isSettingEnabled, LYRICS_LOOKUP_SETTING } from '../../../settings.js';
import { APP_VERSION } from '../../../version.js';

type Q = Record<string, string | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });

interface LyricLine {
  start: number; // ms
  value: string;
}

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const line of lrc.split('\n')) {
    // Matches [mm:ss.xx] or [mm:ss.xxx]
    const m = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) continue;
    const [, min, sec, frac, text] = m;
    const ms = (Number(min) * 60 + Number(sec)) * 1000 + Number(frac.padEnd(3, '0'));
    lines.push({ start: ms, value: text.trim() });
  }
  return lines;
}

interface LrcLibResponse {
  plainLyrics: string | null;
  syncedLyrics: string | null;
  artistName?: string;
  trackName?: string;
}

async function fetchLrcLib(
  title: string,
  artist: string,
  album: string,
  duration: number,
): Promise<LrcLibResponse | null> {
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
    album_name: album,
    duration: String(Math.round(duration)),
  });
  try {
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'User-Agent': `RiffPlayer/${APP_VERSION}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as LrcLibResponse;
  } catch {
    return null;
  }
}

interface TrackRow {
  id: number;
  title: string;
  duration_s: number | null;
  path: string;
  artist_name: string;
  album_name: string;
  lyrics_id: number | null;
}

async function getLyricsBySongIdHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id, f } = p(req);
  if (!id)
    return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  const db = getDb();
  const track = db
    .prepare(`
      SELECT t.id, t.title, t.duration_s, t.path, t.lyrics_id,
             ar.name AS artist_name, al.name AS album_name
      FROM tracks t
      JOIN artists ar ON ar.id = t.artist_id
      JOIN albums al ON al.id = t.album_id
      WHERE t.id = ?
    `)
    .get(Number(id)) as TrackRow | undefined;

  if (!track)
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Track not found' });

  // 1. Check DB cache
  if (track.lyrics_id) {
    const cached = db
      .prepare('SELECT synced_lrc, plain_text FROM lyrics WHERE id = ?')
      .get(track.lyrics_id) as { synced_lrc: string | null; plain_text: string | null } | undefined;

    if (cached) {
      return sendLyrics(reply, f, track, cached.synced_lrc, cached.plain_text);
    }
  }

  // 2. Try .lrc sidecar file alongside the audio file
  const lrcPath = track.path.replace(/\.[^.]+$/, '.lrc');
  let lrcContent: string | null = null;
  try {
    lrcContent = await readFile(lrcPath, 'utf-8');
  } catch {
    // not found — continue
  }

  if (lrcContent) {
    const lyricsId = saveLyrics(db, track.id, lrcContent, null, track.lyrics_id);
    db.prepare('UPDATE tracks SET lyrics_id = ? WHERE id = ?').run(lyricsId, track.id);
    return sendLyrics(reply, f, track, lrcContent, null);
  }

  // 3. Fetch from LRCLIB (sends title/artist/album/duration to an outside
  //    service — the admin can switch this off in Settings)
  if (track.duration_s && isSettingEnabled(LYRICS_LOOKUP_SETTING)) {
    const result = await fetchLrcLib(
      track.title,
      track.artist_name,
      track.album_name,
      track.duration_s,
    );
    if (result && (result.syncedLyrics || result.plainLyrics)) {
      const lyricsId = saveLyrics(db, track.id, result.syncedLyrics, result.plainLyrics, track.lyrics_id);
      db.prepare('UPDATE tracks SET lyrics_id = ? WHERE id = ?').run(lyricsId, track.id);
      return sendLyrics(reply, f, track, result.syncedLyrics, result.plainLyrics);
    }
  }

  // 4. Nothing found
  return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'No lyrics found' });
}

function saveLyrics(
  db: ReturnType<typeof getDb>,
  trackId: number,
  synced: string | null | undefined,
  plain: string | null | undefined,
  existingId: number | null,
): number {
  if (existingId) {
    db.prepare('UPDATE lyrics SET synced_lrc = ?, plain_text = ? WHERE id = ?').run(
      synced ?? null,
      plain ?? null,
      existingId,
    );
    return existingId;
  }
  return Number(
    db
      .prepare('INSERT INTO lyrics (track_id, synced_lrc, plain_text) VALUES (?, ?, ?)')
      .run(trackId, synced ?? null, plain ?? null).lastInsertRowid,
  );
}

function sendLyrics(
  reply: FastifyReply,
  f: string | undefined,
  track: TrackRow,
  syncedLrc: string | null | undefined,
  plainText: string | null | undefined,
): void {
  const hasSynced = !!(syncedLrc?.trim());
  const lines: LyricLine[] = hasSynced ? parseLrc(syncedLrc!) : [];

  const structuredLyrics = {
    displayArtist: track.artist_name,
    displayTitle: track.title,
    lang: 'und',
    offset: 0,
    synced: hasSynced,
    line: hasSynced
      ? lines
      : (plainText ?? '').split('\n').map((v) => ({ start: 0, value: v })),
  };

  const lineXml = structuredLyrics.line
    .map((l) => xmlTag('line', { start: l.start, value: l.value }))
    .join('');
  const slXml = xmlTag('structuredLyrics', {
    displayArtist: structuredLyrics.displayArtist,
    displayTitle: structuredLyrics.displayTitle,
    lang: structuredLyrics.lang,
    offset: structuredLyrics.offset,
    synced: structuredLyrics.synced,
  }, lineXml);

  sendOk(reply, f, {
    xml: xmlTag('lyricsList', {}, slXml),
    json: { lyricsList: { structuredLyrics: [structuredLyrics] } },
  });
}

export async function lyricsPlugin(app: FastifyInstance): Promise<void> {
  app.route({ method: ['GET', 'POST'], url: '/getLyricsBySongId.view', handler: getLyricsBySongIdHandler });
}
