import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { apiAuth, requireAdmin } from '../middleware.js';

export async function adminSettingsPlugin(app: FastifyInstance): Promise<void> {
  // GET /api/v1/admin/settings
  app.get('/admin/settings', { preHandler: [apiAuth, requireAdmin] }, async (_req, reply) => {
    const rows = getDb()
      .prepare("SELECT key, value FROM settings WHERE key NOT IN ('server_secret', 'jwt_secret')")
      .all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const { key, value } of rows) settings[key] = value;
    reply.send({ settings });
  });

  // PATCH /api/v1/admin/settings
  app.patch('/admin/settings', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const body = req.body as Record<string, string | null>;
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    for (const [key, value] of Object.entries(body)) {
      if (value === null) {
        db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      } else {
        upsert.run(key, String(value));
      }
    }
    reply.send({ ok: true });
  });
}
