import { mkdir, writeFile, rm } from 'fs/promises';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { subsonicAuth } from '../../auth/preHandler.js';
import { signToken, verifyToken } from '../../auth/jwt.js';
import { decryptPassword, hashPassword, encryptPassword, verifyPasswordHash } from '../../auth/crypto.js';
import { getOrCreateServerSecret } from '../../auth/seed.js';
import { scanLibrary, isScanInProgress, ScanInProgressError } from '../../indexer/scan.js';
import { recommendationsPlugin } from './recommendations.js';
import { historyPlugin } from './history.js';
import { librarySidebarPlugin } from './librarySidebar.js';
import { systemViewsPlugin } from './systemViews.js';

function getCoversDir(): string {
  return process.env.COVERS_DIR ?? path.join(process.cwd(), 'covers');
}

function jsonError(reply: FastifyReply, statusCode: number, message: string): void {
  reply.code(statusCode).send({ error: message });
}

// ── Auth preHandler (Bearer JWT preferred; Subsonic fallback) ─────────────────

async function apiAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
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
  // Fall back to Subsonic token auth (supports existing integrations)
  await subsonicAuth(req, reply);
}

function requireAdmin(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (req.subsonicUser?.role !== 'admin') {
    reply.code(403).send({ error: 'Admin access required' });
    return;
  }
  done();
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export async function apiPlugin(app: FastifyInstance): Promise<void> {

  // ── POST /api/v1/auth/login — exchange credentials for a JWT ───────────────
  app.post('/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password)
      return jsonError(reply, 400, 'username and password required');

    const db = getDb();
    const user = db
      .prepare('SELECT id, username, role, subsonic_token, password_hash, token_version FROM users WHERE username = ? COLLATE NOCASE')
      .get(username) as
      { id: number; username: string; role: string; subsonic_token: string | null; password_hash: string; token_version: number } | undefined;

    if (!user) return jsonError(reply, 401, 'Wrong username or password');

    // Verify via decrypted subsonic_token or a dedicated hash
    let valid = false;
    if (user.subsonic_token) {
      try {
        const secret = getOrCreateServerSecret(db);
        const plain = decryptPassword(user.subsonic_token, secret);
        valid = plain === password;
      } catch {
        valid = false;
      }
    }
    // Also try bcrypt hash (future-proof)
    if (!valid) {
      valid = verifyPasswordHash(password, user.password_hash);
    }

    if (!valid) return jsonError(reply, 401, 'Wrong username or password');

    const token = signToken(user);
    reply.send({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  // ── GET /api/v1/users/me ────────────────────────────────────────────────────
  app.get('/users/me', { preHandler: apiAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const user = req.subsonicUser!;
    const prefs = db
      .prepare('SELECT transcode_format, transcode_bitrate, lastfm_session_key, listenbrainz_token FROM user_preferences WHERE user_id = ?')
      .get(user.id) as {
        transcode_format: string | null;
        transcode_bitrate: number | null;
        lastfm_session_key: string | null;
        listenbrainz_token: string | null;
      } | undefined;

    reply.send({
      id: user.id,
      username: user.username,
      role: user.role,
      preferences: prefs ?? null,
    });
  });

  // ── PATCH /api/v1/users/me/preferences ──────────────────────────────────────
  app.patch('/users/me/preferences', { preHandler: apiAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.subsonicUser!.id;
    const body = req.body as Record<string, unknown>;
    const db = getDb();

    const exists = db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').get(userId);
    if (!exists) {
      db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
    }

    const allowed = ['transcode_format', 'transcode_bitrate', 'lastfm_session_key', 'listenbrainz_token'];
    for (const key of allowed) {
      if (key in body) {
        db.prepare(`UPDATE user_preferences SET ${key} = ? WHERE user_id = ?`).run(
          body[key] ?? null,
          userId,
        );
      }
    }
    reply.send({ ok: true });
  });

  // ── GET /api/v1/library/stats — for auto-generated page descriptions ───────
  app.get('/library/stats', { preHandler: apiAuth }, async (_req, reply) => {
    const { count } = getDb().prepare('SELECT COUNT(*) AS count FROM tracks').get() as { count: number };
    reply.send({ trackCount: count });
  });

  // ── Admin routes ──────────────────────────────────────────────────────────

  // GET /api/v1/admin/users
  app.get('/admin/users', { preHandler: [apiAuth, requireAdmin] }, async (_req, reply) => {
    const users = getDb()
      .prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at')
      .all();
    reply.send({ users });
  });

  // POST /api/v1/admin/users — create a user
  app.post('/admin/users', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { username, password, role = 'user' } = req.body as {
      username?: string;
      password?: string;
      role?: string;
    };
    if (!username || !password) return jsonError(reply, 400, 'username and password required');
    if (!['admin', 'user'].includes(role)) return jsonError(reply, 400, 'role must be admin or user');

    const db = getDb();
    const secret = getOrCreateServerSecret(db);
    try {
      const id = Number(
        db.prepare(
          `INSERT INTO users (username, password_hash, subsonic_token, role)
           VALUES (?, ?, ?, ?)`,
        ).run(
          username,
          hashPassword(password),
          encryptPassword(password, secret),
          role,
        ).lastInsertRowid,
      );
      reply.code(201).send({ id, username, role });
    } catch {
      jsonError(reply, 409, 'Username already exists');
    }
  });

  // PATCH /api/v1/admin/users/:id — update role or password
  app.patch('/admin/users/:id', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { password, role } = req.body as { password?: string; role?: string };
    const userId = Number((req.params as { id: string }).id);
    const db = getDb();
    const secret = getOrCreateServerSecret(db);

    if (role) {
      if (!['admin', 'user'].includes(role)) return jsonError(reply, 400, 'invalid role');
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    }
    if (password) {
      // Bumping token_version invalidates every JWT already issued to this
      // user — otherwise a token signed before this change stays valid
      // (per its own signature+expiry) for up to 90 more days.
      db.prepare(
        'UPDATE users SET password_hash = ?, subsonic_token = ?, token_version = token_version + 1 WHERE id = ?',
      ).run(
        hashPassword(password),
        encryptPassword(password, secret),
        userId,
      );
    }
    reply.send({ ok: true });
  });

  // DELETE /api/v1/admin/users/:id
  app.delete('/admin/users/:id', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = Number((req.params as { id: string }).id);
    if (userId === req.subsonicUser!.id)
      return jsonError(reply, 400, 'Cannot delete your own account');
    getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);
    reply.send({ ok: true });
  });

  // GET /api/v1/admin/libraries
  app.get('/admin/libraries', { preHandler: [apiAuth, requireAdmin] }, async (_req, reply) => {
    const libs = (getDb().prepare('SELECT id, name, fs_path AS path FROM libraries').all() as
      { id: number; name: string; path: string }[])
      .map((lib) => ({ ...lib, scanning: isScanInProgress(lib.path) }));
    reply.send({ libraries: libs });
  });

  // POST /api/v1/admin/libraries
  app.post('/admin/libraries', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, path: fsPath } = req.body as { name?: string; path?: string };
    if (!name || !fsPath) return jsonError(reply, 400, 'name and path required');
    const id = Number(
      getDb().prepare('INSERT INTO libraries (name, fs_path) VALUES (?, ?)').run(name, fsPath).lastInsertRowid,
    );
    reply.code(201).send({ id, name, path: fsPath });
  });

  // DELETE /api/v1/admin/libraries/:id
  app.delete('/admin/libraries/:id', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    getDb().prepare('DELETE FROM libraries WHERE id = ?').run(Number((req.params as { id: string }).id));
    reply.send({ ok: true });
  });

  // POST /api/v1/admin/libraries/:id/scan — trigger a scan in the background
  app.post('/admin/libraries/:id/scan', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const lib = getDb()
      .prepare('SELECT fs_path FROM libraries WHERE id = ?')
      .get(Number((req.params as { id: string }).id)) as { fs_path: string } | undefined;
    if (!lib) return jsonError(reply, 404, 'Library not found');
    if (isScanInProgress(lib.fs_path))
      return jsonError(reply, 409, 'A scan is already in progress for this library');

    // Fire-and-forget; client can poll /admin/libraries to see changes.
    // scanLibrary() itself is the authoritative guard against overlapping
    // scans (the check above is just a faster, clearer rejection for the
    // common case) — so a ScanInProgressError here means a second request
    // for the same library landed in the tiny window between the check
    // above and this call, which is expected and not worth logging as one.
    scanLibrary(lib.fs_path).catch((err) => {
      if (!(err instanceof ScanInProgressError)) req.log.error({ err }, '[scan] background scan failed');
    });
    reply.send({ ok: true, message: 'Scan started' });
  });

  // GET /api/v1/admin/settings
  app.get('/admin/settings', { preHandler: [apiAuth, requireAdmin] }, async (_req, reply) => {
    const rows = getDb()
      .prepare("SELECT key, value FROM settings WHERE key NOT IN ('server_secret', 'jwt_secret')")
      .all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const { key, value } of rows) settings[key] = value;
    reply.send({ settings });
  });

  // PATCH /api/v1/admin/settings
  app.patch('/admin/settings', { preHandler: [apiAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const body = req.body as Record<string, string | null>;
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    for (const [key, value] of Object.entries(body)) {
      if (value === null) {
        db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      } else {
        upsert.run(key, String(value));
      }
    }
    reply.send({ ok: true });
  });

  // ── Playlist endpoints (from Phase 3, now auth-upgraded) ───────────────────

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

  // ── Manual artist images — global library metadata, admin-managed ──────────

  const IMAGE_MIME_EXT: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  };

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

  // Recommendations & Wrapped — all require auth, registered under /recommendations/*
  app.register(async (reco) => {
    reco.addHook('preHandler', apiAuth);
    reco.register(recommendationsPlugin);
  }, { prefix: '/recommendations' });

  // Track-level play history — all require auth, registered under /history/*
  app.register(async (hist) => {
    hist.addHook('preHandler', apiAuth);
    hist.register(historyPlugin);
  }, { prefix: '/history' });

  // Sidebar pin state + recency — all require auth, registered under /library-sidebar/*
  app.register(async (lib) => {
    lib.addHook('preHandler', apiAuth);
    lib.register(librarySidebarPlugin);
  }, { prefix: '/library-sidebar' });

  // Per-user system-view cover + description overrides — all require auth,
  // registered under /system-views/*
  app.register(async (sv) => {
    sv.addHook('preHandler', apiAuth);
    sv.register(systemViewsPlugin);
  }, { prefix: '/system-views' });
}
