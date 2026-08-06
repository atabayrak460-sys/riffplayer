import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { apiAuth } from './middleware.js';

export async function mePlugin(app: FastifyInstance): Promise<void> {
  // ── GET /api/v1/users/me ────────────────────────────────────────────────────
  app.get('/users/me', { preHandler: apiAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const user = req.subsonicUser!;
    const prefs = db
      .prepare('SELECT transcode_format, transcode_bitrate, lastfm_session_key, listenbrainz_token FROM user_preferences WHERE user_id = ?')
      .get(user.id) as {
        transcode_format: string | null;
        transcode_bitrate: number | null;
        lastfm_session_key: string | null;
        listenbrainz_token: string | null;
      } | undefined;

    reply.send({
      id: user.id,
      username: user.username,
      role: user.role,
      preferences: prefs ?? null,
    });
  });

  // ── PATCH /api/v1/users/me/preferences ──────────────────────────────────────
  app.patch('/users/me/preferences', { preHandler: apiAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.subsonicUser!.id;
    const body = req.body as Record<string, unknown>;
    const db = getDb();

    const exists = db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').get(userId);
    if (!exists) {
      db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
    }

    const allowed = ['transcode_format', 'transcode_bitrate', 'lastfm_session_key', 'listenbrainz_token'];
    for (const key of allowed) {
      if (key in body) {
        db.prepare(`UPDATE user_preferences SET ${key} = ? WHERE user_id = ?`).run(
          body[key] ?? null,
          userId,
        );
      }
    }
    reply.send({ ok: true });
  });

  // ── GET /api/v1/library/stats — for auto-generated page descriptions ───────
  app.get('/library/stats', { preHandler: apiAuth }, async (_req, reply) => {
    const { count } = getDb().prepare('SELECT COUNT(*) AS count FROM tracks').get() as { count: number };
    reply.send({ trackCount: count });
  });
}
