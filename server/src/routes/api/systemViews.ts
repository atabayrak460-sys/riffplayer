import { mkdir, writeFile, rm } from 'fs/promises';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';

const VIEW_KEYS = new Set([
  'favorites', 'recent', 'most-played', 'downloaded', 'discover', 'wrapped',
]);

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
};

function getCoversDir(): string {
  return process.env.COVERS_DIR ?? path.join(process.cwd(), 'covers');
}

function jsonError(reply: FastifyReply, statusCode: number, message: string): void {
  reply.code(statusCode).send({ error: message });
}

function requireViewKey(req: FastifyRequest, reply: FastifyReply): string | null {
  const { key } = req.params as { key: string };
  if (!VIEW_KEYS.has(key)) {
    jsonError(reply, 404, 'Unknown system view');
    return null;
  }
  return key;
}

interface SettingsRow {
  cover_path: string | null;
  description: string | null;
}

export async function systemViewsPlugin(app: FastifyInstance): Promise<void> {
  // GET /api/v1/system-views/:key — this user's overrides for the given view
  app.get('/:key', async (req: FastifyRequest, reply: FastifyReply) => {
    const key = requireViewKey(req, reply);
    if (!key) return;
    const userId = req.subsonicUser!.id;

    const row = getDb()
      .prepare('SELECT cover_path, description FROM system_view_settings WHERE user_id = ? AND view_key = ?')
      .get(userId, key) as SettingsRow | undefined;

    reply.send({
      hasCover: !!row?.cover_path,
      description: row?.description ?? null,
    });
  });

  // PUT /api/v1/system-views/:key/description — set or clear the description override
  app.put('/:key/description', async (req: FastifyRequest, reply: FastifyReply) => {
    const key = requireViewKey(req, reply);
    if (!key) return;
    const userId = req.subsonicUser!.id;
    const { description } = (req.body as { description?: string | null }) ?? {};
    const trimmed = typeof description === 'string' ? description.trim() : '';

    getDb().prepare(`
      INSERT INTO system_view_settings (user_id, view_key, description, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(user_id, view_key) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at
    `).run(userId, key, trimmed || null);

    reply.send({ ok: true });
  });

  // POST /api/v1/system-views/:key/cover — upload a custom cover, replacing any existing one
  app.post('/:key/cover', async (req: FastifyRequest, reply: FastifyReply) => {
    const key = requireViewKey(req, reply);
    if (!key) return;
    const userId = req.subsonicUser!.id;

    const data = await req.file();
    if (!data) return jsonError(reply, 400, 'No file uploaded');
    if (!(data.mimetype in IMAGE_MIME_EXT)) return jsonError(reply, 400, 'Unsupported image type');

    const coversDir = getCoversDir();
    await mkdir(coversDir, { recursive: true });
    const coverPath = path.join(coversDir, `sv-${userId}-${key}.${IMAGE_MIME_EXT[data.mimetype]}`);
    await writeFile(coverPath, await data.toBuffer());

    const existing = getDb()
      .prepare('SELECT cover_path FROM system_view_settings WHERE user_id = ? AND view_key = ?')
      .get(userId, key) as { cover_path: string | null } | undefined;
    if (existing?.cover_path && existing.cover_path !== coverPath) {
      await rm(existing.cover_path, { force: true });
    }

    getDb().prepare(`
      INSERT INTO system_view_settings (user_id, view_key, cover_path, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(user_id, view_key) DO UPDATE SET cover_path = excluded.cover_path, updated_at = excluded.updated_at
    `).run(userId, key, coverPath);

    reply.send({ ok: true });
  });

  // DELETE /api/v1/system-views/:key/cover — reset to the stock SVG
  app.delete('/:key/cover', async (req: FastifyRequest, reply: FastifyReply) => {
    const key = requireViewKey(req, reply);
    if (!key) return;
    const userId = req.subsonicUser!.id;

    const existing = getDb()
      .prepare('SELECT cover_path FROM system_view_settings WHERE user_id = ? AND view_key = ?')
      .get(userId, key) as { cover_path: string | null } | undefined;
    if (existing?.cover_path) {
      await rm(existing.cover_path, { force: true });
    }

    getDb().prepare(`
      UPDATE system_view_settings SET cover_path = NULL, updated_at = unixepoch()
      WHERE user_id = ? AND view_key = ?
    `).run(userId, key);

    reply.send({ ok: true });
  });
}
