import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendOk } from '../response.js';
import { xmlTag, songAttrs, toJson, isoDate, type SongRow } from '../serialize.js';
import { SONG_COLS } from './browse.js';

type Q = Record<string, string | string[] | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });
const arr = (v: string | string[] | undefined): string[] => ([] as string[]).concat(v ?? []);
const str = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

interface PlayQueueRow {
  song_ids: string;
  current_id: string | null;
  position_ms: number;
  changed_at: number;
  changed_by: string | null;
}

function savePlayQueue(req: FastifyRequest, reply: FastifyReply): void {
  const params = p(req);
  const f = str(params.f);
  const ids = arr(params.id);
  const current = str(params.current);
  const position = str(params.position);
  const client = str(params.c);
  const userId = req.subsonicUser!.id;

  getDb()
    .prepare(`
      INSERT INTO play_queue (user_id, song_ids, current_id, position_ms, changed_at, changed_by)
      VALUES (?, ?, ?, ?, unixepoch(), ?)
      ON CONFLICT(user_id) DO UPDATE SET
        song_ids = excluded.song_ids, current_id = excluded.current_id,
        position_ms = excluded.position_ms, changed_at = excluded.changed_at, changed_by = excluded.changed_by
    `)
    .run(userId, JSON.stringify(ids), current ?? null, position != null ? Number(position) : 0, client ?? null);

  sendOk(reply, f);
}

function getPlayQueue(req: FastifyRequest, reply: FastifyReply): void {
  const f = str(p(req).f);
  const userId = req.subsonicUser!.id;
  const db = getDb();

  const row = db
    .prepare('SELECT song_ids, current_id, position_ms, changed_at, changed_by FROM play_queue WHERE user_id = ?')
    .get(userId) as PlayQueueRow | undefined;

  const ids: string[] = row ? JSON.parse(row.song_ids) : [];
  if (!row || ids.length === 0) {
    sendOk(reply, f); // nothing saved yet — bare ok, no <playQueue> element, per spec
    return;
  }

  // t.id IN (...) doesn't preserve queue order, so re-apply it in application code.
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT ${SONG_COLS} WHERE t.id IN (${placeholders})`)
    .all(userId, ...ids.map(Number)) as SongRow[];
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const songs = ids.map((id) => byId.get(id)).filter((s): s is SongRow => s != null);

  const attrs = {
    current: row.current_id ?? undefined,
    position: row.position_ms,
    username: req.subsonicUser!.username,
    changed: isoDate(row.changed_at),
    changedBy: row.changed_by ?? undefined,
  };

  sendOk(reply, f, {
    xml: xmlTag('playQueue', attrs, songs.map((s) => xmlTag('entry', songAttrs(s))).join('')),
    json: { playQueue: { ...toJson(attrs), entry: songs.map((s) => toJson(songAttrs(s))) } },
  });
}

export async function playQueuePlugin(app: FastifyInstance): Promise<void> {
  const route = (url: string, handler: (req: FastifyRequest, reply: FastifyReply) => void) =>
    app.route({ method: ['GET', 'POST'], url, handler });

  route('/savePlayQueue.view', savePlayQueue);
  route('/getPlayQueue.view', getPlayQueue);
}
