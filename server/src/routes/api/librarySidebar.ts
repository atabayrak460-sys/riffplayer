import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';

const ITEM_TYPES = new Set(['system', 'playlist']);

function parseItem(req: FastifyRequest, reply: FastifyReply): { itemType: string; itemKey: string } | null {
  const { itemType, itemKey } = (req.body as Record<string, unknown>) ?? {};
  if (typeof itemType !== 'string' || !ITEM_TYPES.has(itemType) || typeof itemKey !== 'string' || !itemKey) {
    reply.code(400).send({ error: 'itemType (system|playlist) and itemKey are required' });
    return null;
  }
  return { itemType, itemKey };
}

interface StateRow {
  item_type: string;
  playlist_id: number | null;
  system_view_slug: string | null;
  pinned_at: number | null;
  last_interacted_at: number;
}

/**
 * Upserts one column (last_interacted_at or pinned_at) for a sidebar item.
 * `column`/`valueExpr` are always one of a small fixed internal set (never
 * user input), so interpolating them into the SQL is safe.
 *
 * item_key is a playlist id (as text) or a system-view slug depending on
 * itemType — resolved here into the schema's real playlist_id FK /
 * system_view_slug columns (see migration 013) rather than staying a single
 * untyped string. Returns false (caller sends 404) for a playlist id that
 * doesn't exist, rather than letting the FK constraint throw.
 */
function upsertSidebarState(
  userId: number,
  item: { itemType: string; itemKey: string },
  column: 'last_interacted_at' | 'pinned_at',
  valueExpr: 'unixepoch()' | 'NULL',
): boolean {
  const db = getDb();

  if (item.itemType === 'playlist') {
    const playlistId = Number(item.itemKey);
    if (!Number.isInteger(playlistId) || !db.prepare('SELECT 1 FROM playlists WHERE id = ?').get(playlistId)) {
      return false;
    }
    db.prepare(`
      INSERT INTO library_sidebar_state (user_id, item_type, playlist_id, ${column})
      VALUES (?, 'playlist', ?, ${valueExpr})
      ON CONFLICT (user_id, playlist_id) WHERE item_type = 'playlist'
      DO UPDATE SET ${column} = excluded.${column}
    `).run(userId, playlistId);
    return true;
  }

  db.prepare(`
    INSERT INTO library_sidebar_state (user_id, item_type, system_view_slug, ${column})
    VALUES (?, 'system', ?, ${valueExpr})
    ON CONFLICT (user_id, system_view_slug) WHERE item_type = 'system'
    DO UPDATE SET ${column} = excluded.${column}
  `).run(userId, item.itemKey);
  return true;
}

export async function librarySidebarPlugin(app: FastifyInstance): Promise<void> {
  // GET /api/v1/library-sidebar — this user's pin/recency state for every item they've touched
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.subsonicUser!.id;
    const rows = getDb()
      .prepare('SELECT item_type, playlist_id, system_view_slug, pinned_at, last_interacted_at FROM library_sidebar_state WHERE user_id = ?')
      .all(userId) as StateRow[];

    reply.send({
      items: rows.map((r) => ({
        itemType: r.item_type,
        itemKey: r.item_type === 'playlist' ? String(r.playlist_id) : r.system_view_slug,
        pinnedAt: r.pinned_at != null ? new Date(r.pinned_at * 1000).toISOString() : null,
        lastInteractedAt: new Date(r.last_interacted_at * 1000).toISOString(),
      })),
    });
  });

  // POST /api/v1/library-sidebar/interact — call when a Library item is opened
  app.post('/interact', async (req: FastifyRequest, reply: FastifyReply) => {
    const item = parseItem(req, reply);
    if (!item) return;
    const ok = upsertSidebarState(req.subsonicUser!.id, item, 'last_interacted_at', 'unixepoch()');
    if (!ok) return reply.code(404).send({ error: 'Playlist not found' });
    reply.send({ ok: true });
  });

  // POST /api/v1/library-sidebar/pin
  app.post('/pin', async (req: FastifyRequest, reply: FastifyReply) => {
    const item = parseItem(req, reply);
    if (!item) return;
    const ok = upsertSidebarState(req.subsonicUser!.id, item, 'pinned_at', 'unixepoch()');
    if (!ok) return reply.code(404).send({ error: 'Playlist not found' });
    reply.send({ ok: true });
  });

  // POST /api/v1/library-sidebar/unpin
  app.post('/unpin', async (req: FastifyRequest, reply: FastifyReply) => {
    const item = parseItem(req, reply);
    if (!item) return;
    const ok = upsertSidebarState(req.subsonicUser!.id, item, 'pinned_at', 'NULL');
    if (!ok) return reply.code(404).send({ error: 'Playlist not found' });
    reply.send({ ok: true });
  });
}
