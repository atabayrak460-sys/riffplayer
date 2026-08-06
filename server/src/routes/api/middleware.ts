import type { FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { subsonicAuth } from '../../auth/preHandler.js';
import { verifyToken } from '../../auth/jwt.js';

/** Bearer JWT preferred; falls back to Subsonic token auth (supports existing integrations). */
export async function apiAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyToken(token);
      const db = getDb();
      const user = db
        .prepare('SELECT id, username, role, token_version FROM users WHERE id = ?')
        .get(Number(payload.sub)) as
        { id: number; username: string; role: string; token_version: number } | undefined;
      if (!user) return reply.code(401).send({ error: 'Unauthorized' }) as unknown as void;
      if (user.token_version !== payload.tokenVersion)
        return reply.code(401).send({ error: 'Token has been revoked' }) as unknown as void;
      req.subsonicUser = user;
      return;
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' }) as unknown as void;
    }
  }
  // Truly no credentials of any kind (no Bearer header, no Subsonic u=/apiKey=
  // query param either) — a proper 401 JSON error, not subsonicAuth's 200
  // Subsonic-XML "missing parameter" envelope, which /api/v1 JSON clients
  // can't parse as an auth failure.
  const q = req.query as Record<string, string | undefined>;
  if (!q.u && !q.apiKey) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  // Fall back to Subsonic token auth (supports existing integrations)
  await subsonicAuth(req, reply);
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (req.subsonicUser?.role !== 'admin') {
    reply.code(403).send({ error: 'Admin access required' });
    return;
  }
  done();
}
