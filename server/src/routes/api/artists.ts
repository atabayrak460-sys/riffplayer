import { mkdir, writeFile, rm } from 'fs/promises';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { apiAuth, requireAdmin } from './middleware.js';
import { jsonError, getCoversDir } from './helpers.js';

// ── Manual artist images — global library metadata, admin-managed ────────────

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
};

export async function artistsPlugin(app: FastifyInstance): Promise<void> {
  app.post(
    '/artists/:id/cover',
    { preHandler: [apiAuth, requireAdmin] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const artistId = Number((req.params as { id: string }).id);
      const db = getDb();

      const artist = db
        .prepare('SELECT id, image_path FROM artists WHERE id = ?')
        .get(artistId) as { id: number; image_path: string | null } | undefined;
      if (!artist) return jsonError(reply, 404, 'Artist not found');

      const data = await req.file();
      if (!data) return jsonError(reply, 400, 'No file uploaded');

      if (!(data.mimetype in IMAGE_MIME_EXT)) return jsonError(reply, 400, 'Unsupported image type');

      const coversDir = getCoversDir();
      await mkdir(coversDir, { recursive: true });
      const imagePath = path.join(coversDir, `ar-${artistId}.${IMAGE_MIME_EXT[data.mimetype]}`);
      await writeFile(imagePath, await data.toBuffer());

      // Clean up a previous image saved under a different extension
      if (artist.image_path && artist.image_path !== imagePath) {
        await rm(artist.image_path, { force: true });
      }

      db.prepare('UPDATE artists SET image_path = ? WHERE id = ?').run(imagePath, artistId);
      reply.send({ ok: true });
    },
  );

  app.delete(
    '/artists/:id/cover',
    { preHandler: [apiAuth, requireAdmin] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const artistId = Number((req.params as { id: string }).id);
      const db = getDb();

      const artist = db
        .prepare('SELECT image_path FROM artists WHERE id = ?')
        .get(artistId) as { image_path: string | null } | undefined;
      if (!artist) return jsonError(reply, 404, 'Artist not found');

      if (artist.image_path) {
        await rm(artist.image_path, { force: true });
      }
      db.prepare('UPDATE artists SET image_path = NULL WHERE id = ?').run(artistId);
      reply.send({ ok: true });
    },
  );
}
