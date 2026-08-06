import type { FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/database.js';
import { getOrCreateServerSecret } from './seed.js';
import { checkSubsonicToken, decryptPassword, hashApiKey } from './crypto.js';
import { sendError, SubsonicErrorCode, SUBSONIC_API_VERSION } from '../routes/subsonic/response.js';

export interface SubsonicUser {
  id: number;
  username: string;
  role: string;
}

// Only reject a client whose requested protocol version is *newer* than what this
// server speaks (code 30 — "server must upgrade"). Never reject an older `v`: the
// Subsonic API is backward-compatible by design, and rejecting old clients would
// violate this project's hard Subsonic-compatibility rule (see CLAUDE.md) for no
// real benefit — every endpoint here already just implements the current version.
function clientVersionTooNew(v: string | undefined): boolean {
  if (!v) return false;
  const [reqMajor = 0, reqMinor = 0] = v.split('.').map(Number);
  const [srvMajor = 0, srvMinor = 0] = SUBSONIC_API_VERSION.split('.').map(Number);
  if (Number.isNaN(reqMajor) || Number.isNaN(reqMinor)) return false;
  return reqMajor > srvMajor || (reqMajor === srvMajor && reqMinor > srvMinor);
}

export async function subsonicAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const q = request.query as Record<string, string | undefined>;
  const { u: username, t: token, s: salt, apiKey, f, v } = q;

  if (clientVersionTooNew(v)) {
    return sendError(reply, f, {
      code: SubsonicErrorCode.BAD_API_VERSION_SERVER,
      message: `Server supports Subsonic API up to ${SUBSONIC_API_VERSION}, client requested ${v}`,
    });
  }

  if (!username) {
    return sendError(reply, f, {
      code: SubsonicErrorCode.MISSING_PARAM,
      message: 'Required parameter missing: u',
    });
  }

  const db = getDb();
  const user = db
    .prepare(
      'SELECT id, username, role, subsonic_token FROM users WHERE username = ? COLLATE NOCASE',
    )
    .get(username) as
    | { id: number; username: string; role: string; subsonic_token: string | null }
    | undefined;

  if (!user) {
    return sendError(reply, f, {
      code: SubsonicErrorCode.WRONG_CREDENTIALS,
      message: 'Wrong username or password',
    });
  }

  // ── OpenSubsonic API key auth ─────────────────────────────────────────────
  if (apiKey) {
    const keyHash = hashApiKey(apiKey);
    const keyRow = db
      .prepare('SELECT id FROM api_keys WHERE user_id = ? AND key_hash = ?')
      .get(user.id, keyHash);

    if (!keyRow) {
      return sendError(reply, f, {
        code: SubsonicErrorCode.WRONG_CREDENTIALS,
        message: 'Invalid API key',
      });
    }

    db.prepare(
      'UPDATE api_keys SET last_used = unixepoch() WHERE user_id = ? AND key_hash = ?',
    ).run(user.id, keyHash);

    request.subsonicUser = { id: user.id, username: user.username, role: user.role };
    return;
  }

  // ── Classic Subsonic token auth ───────────────────────────────────────────
  if (!token || !salt) {
    return sendError(reply, f, {
      code: SubsonicErrorCode.MISSING_PARAM,
      message: 'Required parameter missing: t or s',
    });
  }

  if (!user.subsonic_token) {
    return sendError(reply, f, {
      code: SubsonicErrorCode.WRONG_CREDENTIALS,
      message: 'Subsonic auth not configured for this account',
    });
  }

  let plainPassword: string;
  try {
    const secret = getOrCreateServerSecret(db);
    plainPassword = decryptPassword(user.subsonic_token, secret);
  } catch {
    return sendError(reply, f, {
      code: SubsonicErrorCode.WRONG_CREDENTIALS,
      message: 'Wrong username or password',
    });
  }

  if (!checkSubsonicToken(plainPassword, token, salt)) {
    return sendError(reply, f, {
      code: SubsonicErrorCode.WRONG_CREDENTIALS,
      message: 'Wrong username or password',
    });
  }

  request.subsonicUser = { id: user.id, username: user.username, role: user.role };
}
