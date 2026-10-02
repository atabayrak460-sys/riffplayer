import { rm } from 'fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { apiAuth, requireAdmin } from '../middleware.js';
import { jsonError } from '../helpers.js';

export async function adminTracksPlugin(app: FastifyInstance): Promise<void> {
  // DELETE /api/v1/admin/tracks/:id — permanently deletes the track: the audio
  // file on disk, then its DB row and dependents.
  app.delete('/admin/tracks/:id', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const trackId = Number((req.params as { id: string }).id);
    const db = getDb();

    const track = db.prepare('SELECT path, lyrics_id FROM tracks WHERE id = ?').get(trackId) as
      { path: string; lyrics_id: number | null } | undefined;
    if (!track) return jsonError(reply, 404, 'Track not found');

    // File first, and the DB only once it's really gone. If the file can't be
    // removed (e.g. the music folder is mounted read-only, as the README's
    // compose example suggests), dropping the row anyway would make the song
    // reappear on the next scan with its play history already wiped.
    // `force` keeps an already-missing file from counting as a failure.
    try {
      await rm(track.path, { force: true });
    } catch (err) {
      req.log.warn({ err, path: track.path }, '[admin] failed to delete track file from disk');
      const code = (err as NodeJS.ErrnoException).code;
      const reason = code === 'EROFS' || code === 'EACCES' || code === 'EPERM'
        ? 'the music folder is read-only or not writable by the server'
        : 'the file could not be removed';
      return jsonError(reply, 409, `Couldn't delete the song: ${reason}. Nothing was changed.`);
    }

    db.transaction(() => {
      // playlist_tracks cascades on its own (ON DELETE CASCADE); play_history
      // doesn't, so it has to go first or the FK rejects the track delete.
      db.prepare('DELETE FROM play_history WHERE track_id = ?').run(trackId);
      if (track.lyrics_id != null) db.prepare('DELETE FROM lyrics WHERE id = ?').run(track.lyrics_id);
      db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
    })();

    reply.send({ ok: true });
  });
}
