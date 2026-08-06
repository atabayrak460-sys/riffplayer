import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { scanLibrary, isScanInProgress, ScanInProgressError } from '../../../indexer/scan.js';
import { apiAuth, requireAdmin } from '../middleware.js';
import { jsonError } from '../helpers.js';

export async function adminLibrariesPlugin(app: FastifyInstance): Promise<void> {
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
}
