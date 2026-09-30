import type { FastifyReply } from 'fastify';

export const SUBSONIC_API_VERSION = '1.16.1';
const SERVER_TYPE = 'riffplayer';
const SERVER_VERSION = '0.1.0';

export interface SubsonicError {
  code: number;
  message: string;
}

// Common Subsonic error codes
export const SubsonicErrorCode = {
  GENERIC: 0,
  MISSING_PARAM: 10,
  BAD_API_VERSION_CLIENT: 20,
  BAD_API_VERSION_SERVER: 30,
  WRONG_CREDENTIALS: 40,
  TOKEN_AUTH_NOT_SUPPORTED: 41,
  NOT_AUTHORIZED: 50,
  TRIAL_CONFIRMED: 60,
  DATA_NOT_FOUND: 70,
} as const;

function xmlEnvelope(status: 'ok' | 'failed', inner: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<subsonic-response xmlns="http://subsonic.org/restapi"` +
    ` status="${status}"` +
    ` version="${SUBSONIC_API_VERSION}"` +
    ` type="${SERVER_TYPE}"` +
    ` serverVersion="${SERVER_VERSION}">` +
    inner +
    `</subsonic-response>`
  );
}

function jsonEnvelope(
  status: 'ok' | 'failed',
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    'subsonic-response': {
      status,
      version: SUBSONIC_API_VERSION,
      type: SERVER_TYPE,
      serverVersion: SERVER_VERSION,
      ...payload,
    },
  };
}

export function sendOk(
  reply: FastifyReply,
  format: string | undefined,
  payload: { xml?: string; json?: Record<string, unknown> } = {},
): void {
  if (format === 'json' || format === 'jsonp') {
    reply.type('application/json; charset=utf-8').send(jsonEnvelope('ok', payload.json ?? {}));
  } else {
    reply.type('text/xml; charset=utf-8').send(xmlEnvelope('ok', payload.xml ?? ''));
  }
}

export function sendError(
  reply: FastifyReply,
  format: string | undefined,
  error: SubsonicError,
): void {
  if (format === 'json' || format === 'jsonp') {
    reply
      .type('application/json; charset=utf-8')
      .send(jsonEnvelope('failed', { error: { code: error.code, message: error.message } }));
  } else {
    const inner = `<error code="${error.code}" message="${escapeXml(error.message)}"/>`;
    reply.type('text/xml; charset=utf-8').send(xmlEnvelope('failed', inner));
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
