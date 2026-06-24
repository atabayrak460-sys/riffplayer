import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendOk, sendError, SubsonicErrorCode } from '../response.js';
import { logPlay } from '../playHistory.js';

type Q = Record<string, string | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });

async function scrobbleHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = p(req);
  const { id, time, submission, f } = params;

  if (!id)
    return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  // submission=false is a "now playing" notification — not a completed play
  if (submission === 'false') {
    sendOk(reply, f);
    return;
  }

  const trackId = Number(id);
  const track = getDb()
    .prepare('SELECT id FROM tracks WHERE id = ?')
    .get(trackId) as { id: number } | undefined;
  if (!track)
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Track not found' });

  logPlay(
    req.subsonicUser!.id,
    trackId,
    params.c,
    time != null ? Number(time) : undefined,
  );

  sendOk(reply, f);
}

export async function scrobblePlugin(app: FastifyInstance): Promise<void> {
  app.route({ method: ['GET', 'POST'], url: '/scrobble.view', handler: scrobbleHandler });
}
