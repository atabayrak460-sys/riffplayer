import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendOk, sendError, SubsonicErrorCode } from '../response.js';
import { xmlTag, toJson } from '../serialize.js';
import { scanLibrary, isScanInProgress, getScanCount, ScanInProgressError } from '../../../indexer/scan.js';

type Q = Record<string, string | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });

// startScan/getScanStatus are server-wide in the Subsonic spec (no library id
// param) — mirrors the custom /api/v1/admin/libraries/:id/scan endpoint, but
// across every configured library at once, for generic Subsonic admin tools
// that only know the standard API.
function libraries(): { fs_path: string }[] {
  return getDb().prepare('SELECT fs_path FROM libraries').all() as { fs_path: string }[];
}

function sendScanStatus(reply: FastifyReply, f: string | undefined): void {
  const libs = libraries();
  const attrs = {
    scanning: libs.some((lib) => isScanInProgress(lib.fs_path)),
    count: libs.reduce((sum, lib) => sum + getScanCount(lib.fs_path), 0),
  };
  sendOk(reply, f, {
    xml: xmlTag('scanStatus', attrs),
    json: { scanStatus: toJson(attrs) },
  });
}

function startScan(req: FastifyRequest, reply: FastifyReply): void {
  const { f } = p(req);
  if (req.subsonicUser!.role !== 'admin') {
    return sendError(reply, f, {
      code: SubsonicErrorCode.NOT_AUTHORIZED,
      message: 'Only admins may trigger a scan',
    });
  }

  for (const lib of libraries()) {
    if (isScanInProgress(lib.fs_path)) continue; // already running, nothing to do
    scanLibrary(lib.fs_path).catch((err) => {
      if (!(err instanceof ScanInProgressError)) req.log.error({ err }, '[scan] background scan failed');
    });
  }

  sendScanStatus(reply, f);
}

function getScanStatus(req: FastifyRequest, reply: FastifyReply): void {
  sendScanStatus(reply, p(req).f);
}

export async function scanPlugin(app: FastifyInstance): Promise<void> {
  const route = (url: string, handler: (req: FastifyRequest, reply: FastifyReply) => void) =>
    app.route({ method: ['GET', 'POST'], url, handler });

  route('/startScan.view', startScan);
  route('/getScanStatus.view', getScanStatus);
}
