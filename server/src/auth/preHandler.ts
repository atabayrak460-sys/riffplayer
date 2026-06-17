import type { FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/database.js';
import { getOrCreateServerSecret } from './seed.js';
import { checkSubsonicToken, decryptPassword, hashApiKey } from './crypto.js';
import { sendError, SubsonicErrorCode } from '../routes/subsonic/response.js';

export interface SubsonicUser {
  id: number;
  username: string;
  role: string;
}

export async function subsonicAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const q = request.query as Record<string, string | undefined>;
  const { u: username, t: token, s: salt, apiKey, f } = q;

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
