import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { songAttrs, toJson, type SongRow } from '../subsonic/serialize.js';
import { SONG_SELECT_LIST, SONG_FROM } from '../subsonic/endpoints/browse.js';
import {
  ConnectHub, parseCommand, parseDeviceType, parseStateReport, sanitizeName, validDeviceId,
  type ConnectEvent, type ResolvedSong,
} from '../../connect/hub.js';

// RiffPlayer Connect: lets one user's devices see each other, mirror what is playing and control
// it. The logic lives in connect/hub.ts; this file is the HTTP surface (SSE stream, long-poll
// fallback and the POST endpoints). Design: docs/CONNECT-DESIGN.md.

// Read at call time (not import time) so tests can shorten them.
const heartbeatMs = () => Number(process.env.RIFFPLAYER_CONNECT_HEARTBEAT_MS) || 20_000;
const tickMs = () => Number(process.env.RIFFPLAYER_CONNECT_TICK_MS) || 5_000;
const pollHoldMs = () => Number(process.env.RIFFPLAYER_CONNECT_POLL_HOLD_MS) || 25_000;

const SQLITE_CHUNK = 500;

function resolveSongs(userId: number, ids: string[]): ResolvedSong[] {
  const numeric = [...new Set(ids.filter((id) => /^\d+$/.test(id)))];
  const db = getDb();
  const out: ResolvedSong[] = [];
  for (let i = 0; i < numeric.length; i += SQLITE_CHUNK) {
    const chunk = numeric.slice(i, i + SQLITE_CHUNK);
    const rows = db
      .prepare(`SELECT ${SONG_SELECT_LIST} ${SONG_FROM} WHERE t.id IN (${chunk.map(() => '?').join(',')})`)
      .all(userId, ...chunk) as SongRow[];
    for (const row of rows) {
      out.push({
        id: String(row.id),
        durationMs: row.duration_s != null ? Math.round(row.duration_s * 1000) : null,
        json: toJson(songAttrs(row)),
      });
    }
  }
  return out;
}

/** The user's current token_version, or undefined if the account no longer exists. */
function tokenVersion(userId: number): number | undefined {
  const row = getDb().prepare('SELECT token_version FROM users WHERE id = ?').get(userId) as
    { token_version: number } | undefined;
  return row?.token_version;
}

const bad = (reply: FastifyReply, message: string) => reply.code(400).send({ error: message });

function deviceIdFrom(body: unknown): string | null {
  const id = (body as Record<string, unknown> | null)?.deviceId;
  return validDeviceId(id) ? id : null;
}

const DEVICE_ID_HELP = 'deviceId required (8-64 characters: letters, digits, "-" and "_")';

export async function connectPlugin(app: FastifyInstance): Promise<void> {
  const hub = new ConnectHub({ resolveSongs });

  const ticker = setInterval(() => hub.tick(), tickMs());
  ticker.unref();
  // preClose (not onClose): app.close() waits for open connections before it runs onClose hooks, and
  // an SSE stream never ends on its own — so the streams have to be ended *before* that wait begins.
  app.addHook('preClose', async () => {
    clearInterval(ticker);
    hub.shutdown();
  });

  // ── SSE stream ──────────────────────────────────────────────────────────
  // fetch()-based clients (not EventSource) because the stream is authenticated with a Bearer header.
  app.get('/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.subsonicUser!.id;
    const q = req.query as Record<string, string | undefined>;
    if (!validDeviceId(q.deviceId)) return bad(reply, DEVICE_ID_HELP);
    const info = { deviceId: q.deviceId, name: sanitizeName(q.name), type: parseDeviceType(q.type) };

    const versionAtConnect = tokenVersion(userId);
    if (versionAtConnect === undefined) return reply.code(401).send({ error: 'Unauthorized' });

    // From here we write the response ourselves and keep it open.
    reply.hijack();
    const raw = reply.raw;
    const headers = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tell nginx-style proxies (and Cloudflare) not to hold chunks back.
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    };

    let heartbeat: NodeJS.Timeout | undefined;
    const sink = {
      send(seq: number, event: ConnectEvent) {
        raw.write(`id: ${seq}\nevent: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`);
      },
      end() {
        if (heartbeat) clearInterval(heartbeat);
        if (!raw.writableEnded) raw.end();
      },
    };

    raw.writeHead(200, headers);
    raw.write('retry: 3000\n\n');

    const conn = hub.connectStream(userId, info, sink);
    if (!conn.ok) {
      // Headers are out already, so the refusal is an event instead of a status code.
      raw.write(`event: error\ndata: ${JSON.stringify({ error: 'too_many_devices' })}\n\n`);
      raw.end();
      return;
    }

    // Heartbeat keeps proxies from timing the stream out, and doubles as the revocation check:
    // a password change bumps token_version, which must close streams opened with the old token.
    heartbeat = setInterval(() => {
      if (tokenVersion(userId) !== versionAtConnect) {
        hub.revoke(userId);
        return;
      }
      try {
        raw.write(': ping\n\n');
      } catch {
        // a dead socket is cleaned up by the close handler below
      }
    }, heartbeatMs());

    req.raw.on('close', () => {
      if (heartbeat) clearInterval(heartbeat);
      hub.disconnect(userId, info.deviceId, conn.connId);
    });
  });

  // ── Long-poll fallback (for paths that buffer streams) ──────────────────
  app.get('/poll', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.subsonicUser!.id;
    const q = req.query as Record<string, string | undefined>;
    if (!validDeviceId(q.deviceId)) return bad(reply, DEVICE_ID_HELP);
    let since: number | undefined;
    if (q.since !== undefined) {
      since = Number(q.since);
      if (!Number.isInteger(since) || since < 0) return bad(reply, 'since must be a non-negative integer');
    }
    const info = { deviceId: q.deviceId, name: sanitizeName(q.name), type: parseDeviceType(q.type) };

    const r = await hub.pollEvents(userId, info, since, pollHoldMs());
    if (!r.ok) return reply.code(429).send({ error: r.reason });
    return { events: r.events.map((e) => ({ seq: e.seq, event: e.event.name, data: e.event.data })) };
  });

  // ── Reads ───────────────────────────────────────────────────────────────
  app.get('/state', async (req: FastifyRequest) => hub.snapshot(req.subsonicUser!.id));

  app.get('/queue', async (req: FastifyRequest, reply: FastifyReply) => {
    const queue = hub.queue(req.subsonicUser!.id);
    if (!queue) return reply.code(404).send({ error: 'nothing_playing' });
    return queue;
  });

  // ── Writes ──────────────────────────────────────────────────────────────
  app.post('/state', { bodyLimit: 256 * 1024 }, async (req: FastifyRequest, reply: FastifyReply) => {
    const deviceId = deviceIdFrom(req.body);
    if (!deviceId) return bad(reply, DEVICE_ID_HELP);
    const report = parseStateReport(req.body);
    if (typeof report === 'string') return bad(reply, report);

    const r = hub.reportState(req.subsonicUser!.id, deviceId, report);
    if (r.ok) return { accepted: true, takeover: r.takeover === true };
    switch (r.reason) {
      // Not an error: this device just isn't the one playing (any more).
      case 'not_active': return { accepted: false, reason: 'not_active' };
      case 'need_queue': return reply.code(409).send({ error: 'need_queue' });
      case 'unknown_device': return reply.code(409).send({ error: 'unknown_device' });
      case 'rate_limited': return reply.code(429).send({ error: 'rate_limited' });
    }
  });

  app.post('/command', async (req: FastifyRequest, reply: FastifyReply) => {
    const deviceId = deviceIdFrom(req.body);
    if (!deviceId) return bad(reply, DEVICE_ID_HELP);
    const cmd = parseCommand(req.body);
    if (typeof cmd === 'string') return bad(reply, cmd);

    const r = hub.sendCommand(req.subsonicUser!.id, deviceId, cmd);
    if (r.ok) return reply.code(202).send({ delivered: true, duplicate: r.duplicate === true });
    if (r.reason === 'rate_limited') return reply.code(429).send({ error: 'rate_limited' });
    return reply.code(409).send({ error: r.reason });
  });

  app.post('/transfer', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const deviceId = deviceIdFrom(body);
    if (!deviceId || !validDeviceId(body.toDeviceId)) return bad(reply, `${DEVICE_ID_HELP}; toDeviceId required too`);
    if (body.play !== undefined && typeof body.play !== 'boolean') return bad(reply, 'play must be a boolean');

    const r = hub.transfer(req.subsonicUser!.id, deviceId, body.toDeviceId, body.play !== false);
    if (r.ok) return reply.code(r.status === 'pending' ? 202 : 200).send({ status: r.status });
    switch (r.reason) {
      case 'target_offline': return reply.code(404).send({ error: r.reason });
      case 'rate_limited': return reply.code(429).send({ error: r.reason });
      default: return reply.code(409).send({ error: r.reason });
    }
  });

  app.patch('/device', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const deviceId = deviceIdFrom(body);
    if (!deviceId) return bad(reply, DEVICE_ID_HELP);
    if (typeof body.name !== 'string') return bad(reply, 'name required');
    if (!hub.rename(req.subsonicUser!.id, deviceId, body.name)) return reply.code(404).send({ error: 'unknown_device' });
    return { ok: true };
  });
}
