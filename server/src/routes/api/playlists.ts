import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { apiAuth } from './middleware.js';
import { jsonError, getCoversDir } from './helpers.js';

export async function playlistsPlugin(app: FastifyInstance): Promise<void> {
  app.put(
    '/playlists/:id/tracks',
    { preHandler: apiAuth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const playlistId = Number((req.params as { id: string }).id);
      const { trackIds } = req.body as { trackIds: string[] };
      if (!Array.isArray(trackIds)) return jsonError(reply, 400, 'trackIds must be an array');

      const db = getDb();
      const userId = req.subsonicUser!.id;
      const playlist = db
        .prepare('SELECT id FROM playlists WHERE id = ? AND owner_id = ?')
        .get(playlistId, userId);
      if (!playlist) return jsonError(reply, 404, 'Playlist not found or not owned');

      db.transaction(() => {
        // Preserve each track's original added_at across the reorder — this
        // endpoint only ever reorders existing rows, so a plain delete +
        // reinsert would otherwise reset every "date added" to now.
        const existing = db
          .prepare('SELECT track_id, added_at FROM playlist_tracks WHERE playlist_id = ?')
          .all(playlistId) as { track_id: number; added_at: number | null }[];
        const addedAtByTrack = new Map(existing.map((r) => [r.track_id, r.added_at]));

        db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId);
        const ins = db.prepare(
          'INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, COALESCE(?, unixepoch()))',
        );
        trackIds.forEach((tid, i) => {
          const trackId = Number(tid);
          ins.run(playlistId, trackId, i, addedAtByTrack.get(trackId) ?? null);
        });
        db.prepare('UPDATE playlists SET updated_at = unixepoch() WHERE id = ?').run(playlistId);
      })();

      reply.send({ ok: true });
    },
  );

  // GET /api/v1/playlists/:id/track-dates — when each track was added to this playlist
  app.get(
    '/playlists/:id/track-dates',
    { preHandler: apiAuth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const playlistId = Number((req.params as { id: string }).id);
      const userId = req.subsonicUser!.id;
      const db = getDb();

      const playlist = db
        .prepare('SELECT id FROM playlists WHERE id = ? AND (owner_id = ? OR is_public = 1)')
        .get(playlistId, userId);
      if (!playlist) return jsonError(reply, 404, 'Playlist not found');

      const rows = db
        .prepare('SELECT track_id, added_at FROM playlist_tracks WHERE playlist_id = ?')
        .all(playlistId) as { track_id: number; added_at: number | null }[];

      const dates: Record<string, string> = {};
      for (const r of rows) {
        if (r.added_at != null) dates[String(r.track_id)] = new Date(r.added_at * 1000).toISOString();
      }
      reply.send({ dates });
    },
  );

  app.post(
    '/playlists/:id/cover',
    { preHandler: apiAuth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const playlistId = Number((req.params as { id: string }).id);
      const db = getDb();
      const userId = req.subsonicUser!.id;

      const playlist = db
        .prepare('SELECT id FROM playlists WHERE id = ? AND owner_id = ?')
        .get(playlistId, userId);
      if (!playlist) return jsonError(reply, 404, 'Playlist not found or not owned');

      const data = await req.file();
      if (!data) return jsonError(reply, 400, 'No file uploaded');

      const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
      if (!ALLOWED.has(data.mimetype)) return jsonError(reply, 400, 'Unsupported image type');

      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
      };
      const coversDir = getCoversDir();
      await mkdir(coversDir, { recursive: true });
      const coverPath = path.join(coversDir, `pl-${playlistId}.${extMap[data.mimetype] ?? 'jpg'}`);
      await writeFile(coverPath, await data.toBuffer());

      db.prepare('UPDATE playlists SET cover_path = ?, updated_at = unixepoch() WHERE id = ?').run(
        coverPath, playlistId,
      );
      reply.send({ ok: true });
    },
  );
}
