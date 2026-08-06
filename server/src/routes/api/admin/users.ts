import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { hashPassword, encryptPassword } from '../../../auth/crypto.js';
import { getOrCreateServerSecret } from '../../../auth/seed.js';
import { apiAuth, requireAdmin } from '../middleware.js';
import { jsonError } from '../helpers.js';

export async function adminUsersPlugin(app: FastifyInstance): Promise<void> {
  // GET /api/v1/admin/users
  app.get('/admin/users', { preHandler: [apiAuth, requireAdmin] }, async (_req, reply) => {
    const users = getDb()
      .prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at')
      .all();
    reply.send({ users });
  });

  // POST /api/v1/admin/users — create a user
  app.post('/admin/users', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { username, password, role = 'user' } = req.body as {
      username?: string;
      password?: string;
      role?: string;
    };
    if (!username || !password) return jsonError(reply, 400, 'username and password required');
    if (!['admin', 'user'].includes(role)) return jsonError(reply, 400, 'role must be admin or user');

    const db = getDb();
    const secret = getOrCreateServerSecret(db);
    try {
      const id = Number(
        db.prepare(
          `INSERT INTO users (username, password_hash, subsonic_token, role)
           VALUES (?, ?, ?, ?)`,
        ).run(
          username,
          hashPassword(password),
          encryptPassword(password, secret),
          role,
        ).lastInsertRowid,
      );
      reply.code(201).send({ id, username, role });
    } catch {
      jsonError(reply, 409, 'Username already exists');
    }
  });

  // PATCH /api/v1/admin/users/:id — update role or password
  app.patch('/admin/users/:id', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { password, role } = req.body as { password?: string; role?: string };
    const userId = Number((req.params as { id: string }).id);
    const db = getDb();
    const secret = getOrCreateServerSecret(db);

    if (role) {
      if (!['admin', 'user'].includes(role)) return jsonError(reply, 400, 'invalid role');
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    }
    if (password) {
      // Bumping token_version invalidates every JWT already issued to this
      // user — otherwise a token signed before this change stays valid
      // (per its own signature+expiry) for up to 90 more days.
      db.prepare(
        'UPDATE users SET password_hash = ?, subsonic_token = ?, token_version = token_version + 1 WHERE id = ?',
      ).run(
        hashPassword(password),
        encryptPassword(password, secret),
        userId,
      );
    }
    reply.send({ ok: true });
  });

  // DELETE /api/v1/admin/users/:id
  app.delete('/admin/users/:id', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = Number((req.params as { id: string }).id);
    if (userId === req.subsonicUser!.id)
      return jsonError(reply, 400, 'Cannot delete your own account');
    getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);
    reply.send({ ok: true });
  });
}
