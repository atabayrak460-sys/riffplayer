import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { signToken } from '../../auth/jwt.js';
import { decryptPassword, verifyPasswordHash } from '../../auth/crypto.js';
import { getOrCreateServerSecret } from '../../auth/seed.js';
import { jsonError } from './helpers.js';

export async function authPlugin(app: FastifyInstance): Promise<void> {
  // ── POST /api/v1/auth/login — exchange credentials for a JWT ───────────────
  app.post('/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password)
      return jsonError(reply, 400, 'username and password required');

    const db = getDb();
    const user = db
      .prepare('SELECT id, username, role, subsonic_token, password_hash, token_version FROM users WHERE username = ? COLLATE NOCASE')
      .get(username) as
      { id: number; username: string; role: string; subsonic_token: string | null; password_hash: string; token_version: number } | undefined;

    if (!user) return jsonError(reply, 401, 'Wrong username or password');

    // Verify via decrypted subsonic_token or a dedicated hash
    let valid = false;
    if (user.subsonic_token) {
      try {
        const secret = getOrCreateServerSecret(db);
        const plain = decryptPassword(user.subsonic_token, secret);
        valid = plain === password;
      } catch {
        valid = false;
      }
    }
    // Also try bcrypt hash (future-proof)
    if (!valid) {
      valid = verifyPasswordHash(password, user.password_hash);
    }

    if (!valid) return jsonError(reply, 401, 'Wrong username or password');

    const token = signToken(user);
    reply.send({ token, user: { id: user.id, username: user.username, role: user.role } });
  });
}
