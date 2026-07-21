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
  item_key: string;
  pinned_at: number | null;
  last_interacted_at: number;
}

export async function librarySidebarPlugin(app: FastifyInstance): Promise<void> {
  // GET /api/v1/library-sidebar — this user's pin/recency state for every item they've touched
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.subsonicUser!.id;
    const rows = getDb()
      .prepare('SELECT item_type, item_key, pinned_at, last_interacted_at FROM library_sidebar_state WHERE user_id = ?')
      .all(userId) as StateRow[];

    reply.send({
      items: rows.map((r) => ({
        itemType: r.item_type,
        itemKey: r.item_key,
        pinnedAt: r.pinned_at != null ? new Date(r.pinned_at * 1000).toISOString() : null,
        lastInteractedAt: new Date(r.last_interacted_at * 1000).toISOString(),
      })),
    });
  });

  // POST /api/v1/library-sidebar/interact — call when a Library item is opened
  app.post('/interact', async (req: FastifyRequest, reply: FastifyReply) => {
    const item = parseItem(req, reply);
    if (!item) return;
    const userId = req.subsonicUser!.id;

    getDb().prepare(`
      INSERT INTO library_sidebar_state (user_id, item_type, item_key, last_interacted_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(user_id, item_type, item_key) DO UPDATE SET last_interacted_at = excluded.last_interacted_at
    `).run(userId, item.itemType, item.itemKey);

    reply.send({ ok: true });
  });

  // POST /api/v1/library-sidebar/pin
  app.post('/pin', async (req: FastifyRequest, reply: FastifyReply) => {
    const item = parseItem(req, reply);
    if (!item) return;
    const userId = req.subsonicUser!.id;

    getDb().prepare(`
      INSERT INTO library_sidebar_state (user_id, item_type, item_key, pinned_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(user_id, item_type, item_key) DO UPDATE SET pinned_at = excluded.pinned_at
    `).run(userId, item.itemType, item.itemKey);

    reply.send({ ok: true });
  });

  // POST /api/v1/library-sidebar/unpin
  app.post('/unpin', async (req: FastifyRequest, reply: FastifyReply) => {
    const item = parseItem(req, reply);
    if (!item) return;
    const userId = req.subsonicUser!.id;

    getDb().prepare(`
      INSERT INTO library_sidebar_state (user_id, item_type, item_key, pinned_at)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(user_id, item_type, item_key) DO UPDATE SET pinned_at = NULL
    `).run(userId, item.itemType, item.itemKey);

    reply.send({ ok: true });
  });
}
