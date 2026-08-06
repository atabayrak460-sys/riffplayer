import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendOk, sendError, SubsonicErrorCode } from '../response.js';
import { logPlay } from '../playHistory.js';
import { fireExternalScrobbles } from '../../../scrobbler.js';

type Q = Record<string, string | string[] | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });
// The Subsonic spec allows repeated `id` (batch scrobble) with a `time`
// array of the same length, aligned by index. Same array-coercion pattern
// as playlists.ts/favorites.ts.
const arr = (v: string | string[] | undefined): string[] => ([] as string[]).concat(v ?? []);
const str = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

async function scrobbleHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = p(req);
  const f = str(params.f);
  const ids = arr(params.id);
  const times = arr(params.time);
  const submission = str(params.submission);
  const client = str(params.c);

  if (!ids.length)
    return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  // submission=false is a "now playing" notification — not a completed play
  if (submission === 'false') {
    sendOk(reply, f);
    return;
  }

  const db = getDb();
  let matched = 0;
  for (let i = 0; i < ids.length; i++) {
    const trackId = Number(ids[i]);
    const track = db.prepare('SELECT id FROM tracks WHERE id = ?').get(trackId) as { id: number } | undefined;
    if (!track) continue; // skip unknown ids in a batch rather than failing the whole call
    matched++;

    const playedAtMs = times[i] != null ? Number(times[i]) : undefined;
    logPlay(req.subsonicUser!.id, trackId, client, playedAtMs);

    const playedAt = playedAtMs != null ? Math.floor(playedAtMs / 1000) : Math.floor(Date.now() / 1000);
    fireExternalScrobbles(req.subsonicUser!.id, trackId, playedAt);
  }

  // Preserves the single-id behaviour (a single unknown id is still a real
  // DATA_NOT_FOUND, not a silent no-op) while a partially-unknown batch just
  // scrobbles whichever ids were real.
  if (!matched)
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Track not found' });

  sendOk(reply, f);
}

export async function scrobblePlugin(app: FastifyInstance): Promise<void> {
  app.route({ method: ['GET', 'POST'], url: '/scrobble.view', handler: scrobbleHandler });
}
