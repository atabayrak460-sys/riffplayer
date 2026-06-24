import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { subsonicAuth } from '../../auth/preHandler.js';

function getCoversDir(): string {
  return process.env.COVERS_DIR ?? path.join(process.cwd(), 'covers');
}

function jsonError(reply: FastifyReply, statusCode: number, message: string): void {
  reply.code(statusCode).send({ error: message });
}

export async function apiPlugin(app: FastifyInstance): Promise<void> {
  // All /api/v1 routes require Subsonic auth (JWT will replace this in Phase 4)
  app.addHook('preHandler', async (req, reply) => {
    await subsonicAuth(req, reply);
  });

  // ── PUT /api/v1/playlists/:id/tracks ───────────────────────────────────────
  // Replace the ordered track list for a playlist (enables drag-to-reorder).
  // Body: { "trackIds": ["1", "2", "3"] }
  app.put(
    '/playlists/:id/tracks',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const playlistId = Number(req.params.id);
      const { trackIds } = req.body as { trackIds: string[] };

      if (!Array.isArray(trackIds))
        return jsonError(reply, 400, 'trackIds must be an array');

      const db = getDb();
      const userId = req.subsonicUser!.id;

      const playlist = db
        .prepare('SELECT id FROM playlists WHERE id = ? AND owner_id = ?')
        .get(playlistId, userId);
      if (!playlist) return jsonError(reply, 404, 'Playlist not found or not owned');

      db.transaction(() => {
        db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId);
        const ins = db.prepare(
          'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
        );
        trackIds.forEach((tid, i) => ins.run(playlistId, Number(tid), i));
        db.prepare(
          'UPDATE playlists SET updated_at = unixepoch() WHERE id = ?',
        ).run(playlistId);
      })();

      reply.send({ ok: true });
    },
  );

  // ── POST /api/v1/playlists/:id/cover ───────────────────────────────────────
  // Upload a custom cover image for a playlist.
  app.post(
    '/playlists/:id/cover',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const playlistId = Number(req.params.id);
      const db = getDb();
      const userId = req.subsonicUser!.id;

      const playlist = db
        .prepare('SELECT id FROM playlists WHERE id = ? AND owner_id = ?')
        .get(playlistId, userId);
      if (!playlist) return jsonError(reply, 404, 'Playlist not found or not owned');

      const data = await req.file();
      if (!data) return jsonError(reply, 400, 'No file uploaded');

      const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
      const mime = data.mimetype;
      if (!ALLOWED_TYPES.has(mime)) return jsonError(reply, 400, 'Unsupported image type');

      const coversDir = getCoversDir();
      await mkdir(coversDir, { recursive: true });

      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      const ext = extMap[mime] ?? 'jpg';
      const coverPath = path.join(coversDir, `pl-${playlistId}.${ext}`);

      const buffer = await data.toBuffer();
      await writeFile(coverPath, buffer);

      db.prepare(
        'UPDATE playlists SET cover_path = ?, updated_at = unixepoch() WHERE id = ?',
      ).run(coverPath, playlistId);

      reply.send({ ok: true, coverPath });
    },
  );
}
