import { rm } from 'fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { apiAuth, requireAdmin } from '../middleware.js';
import { jsonError } from '../helpers.js';

export async function adminTracksPlugin(app: FastifyInstance): Promise<void> {
  // DELETE /api/v1/admin/tracks/:id — permanently deletes the track: its DB
  // row and dependents, then the audio file on disk.
  app.delete('/admin/tracks/:id', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const trackId = Number((req.params as { id: string }).id);
    const db = getDb();

    const track = db.prepare('SELECT path, lyrics_id FROM tracks WHERE id = ?').get(trackId) as
      { path: string; lyrics_id: number | null } | undefined;
    if (!track) return jsonError(reply, 404, 'Track not found');

    db.transaction(() => {
      // playlist_tracks cascades on its own (ON DELETE CASCADE); play_history
      // doesn't, so it has to go first or the FK rejects the track delete.
      db.prepare('DELETE FROM play_history WHERE track_id = ?').run(trackId);
      if (track.lyrics_id != null) db.prepare('DELETE FROM lyrics WHERE id = ?').run(track.lyrics_id);
      db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
    })();

    // Best-effort — the library entry is already gone either way, so a file
    // that fails to delete (permissions, etc.) is a minor cleanup issue, not
    // something that should make the whole request look like it failed.
    await rm(track.path, { force: true }).catch((err) => {
      req.log.warn({ err, path: track.path }, '[admin] failed to delete track file from disk');
    });

    reply.send({ ok: true });
  });
}
