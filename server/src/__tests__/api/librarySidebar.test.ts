import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { seedLibrary, authParams } from '../subsonic/helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
  seedLibrary(getDb());
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams();
const sr = (body: string) =>
  (JSON.parse(body) as Record<string, Record<string, unknown>>)['subsonic-response'];

describe('POST /api/v1/library-sidebar/interact', () => {
  it('records a last-interacted timestamp for the item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/library-sidebar/interact?${auth}`,
      payload: { itemType: 'system', itemKey: 'favorites' },
    });
    expect(res.statusCode).toBe(200);

    const list = await app.inject({ url: `/api/v1/library-sidebar?${auth}` });
    const body = JSON.parse(list.body) as { items: { itemType: string; itemKey: string; pinnedAt: string | null; lastInteractedAt: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ itemType: 'system', itemKey: 'favorites', pinnedAt: null });
    expect(body.items[0].lastInteractedAt).toBeTruthy();
  });

  it('updates the timestamp on repeated interactions rather than duplicating rows', async () => {
    const create = await app.inject({ url: `/rest/createPlaylist.view?${auth}&name=P` });
    const plId = String((sr(create.body).playlist as Record<string, unknown>).id);

    await app.inject({
      method: 'POST', url: `/api/v1/library-sidebar/interact?${auth}`,
      payload: { itemType: 'playlist', itemKey: plId },
    });
    const first = JSON.parse((await app.inject({ url: `/api/v1/library-sidebar?${auth}` })).body) as {
      items: { lastInteractedAt: string }[];
    };

    await app.inject({
      method: 'POST', url: `/api/v1/library-sidebar/interact?${auth}`,
      payload: { itemType: 'playlist', itemKey: plId },
    });
    const second = JSON.parse((await app.inject({ url: `/api/v1/library-sidebar?${auth}` })).body) as {
      items: { lastInteractedAt: string }[];
    };

    expect(second.items).toHaveLength(1);
    expect(new Date(second.items[0].lastInteractedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(first.items[0].lastInteractedAt).getTime());
  });

  it('rejects an unknown itemType', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/library-sidebar/interact?${auth}`,
      payload: { itemType: 'bogus', itemKey: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  // #17: itemKey now resolves to a real playlist_id FK — a playlist that
  // doesn't exist must be rejected, not silently inserted as before.
  it('returns 404 for a playlist itemKey that does not exist', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/library-sidebar/interact?${auth}`,
      payload: { itemType: 'playlist', itemKey: '999999' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/library-sidebar/pin and /unpin', () => {
  it('pin sets a pinnedAt timestamp; unpin clears it back to null', async () => {
    await app.inject({
      method: 'POST', url: `/api/v1/library-sidebar/pin?${auth}`,
      payload: { itemType: 'system', itemKey: 'wrapped' },
    });
    const afterPin = JSON.parse((await app.inject({ url: `/api/v1/library-sidebar?${auth}` })).body) as {
      items: { pinnedAt: string | null }[];
    };
    expect(afterPin.items[0].pinnedAt).toBeTruthy();

    await app.inject({
      method: 'POST', url: `/api/v1/library-sidebar/unpin?${auth}`,
      payload: { itemType: 'system', itemKey: 'wrapped' },
    });
    const afterUnpin = JSON.parse((await app.inject({ url: `/api/v1/library-sidebar?${auth}` })).body) as {
      items: { pinnedAt: string | null }[];
    };
    expect(afterUnpin.items[0].pinnedAt).toBeNull();
  });

  it('pinning an item with no prior interaction still creates its row', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/library-sidebar/pin?${auth}`,
      payload: { itemType: 'system', itemKey: 'downloaded' },
    });
    expect(res.statusCode).toBe(200);

    const list = JSON.parse((await app.inject({ url: `/api/v1/library-sidebar?${auth}` })).body) as {
      items: { itemKey: string; pinnedAt: string | null }[];
    };
    expect(list.items.find((i) => i.itemKey === 'downloaded')?.pinnedAt).toBeTruthy();
  });
});

describe('deletePlaylist cleans up its library_sidebar_state rows', () => {
  it('removes sidebar state for a deleted playlist', async () => {
    const create = await app.inject({ url: `/rest/createPlaylist.view?${auth}&name=ToDelete` });
    const plId = String((sr(create.body).playlist as Record<string, unknown>).id);

    await app.inject({
      method: 'POST', url: `/api/v1/library-sidebar/pin?${auth}`,
      payload: { itemType: 'playlist', itemKey: plId },
    });
    expect(
      getDb().prepare("SELECT COUNT(*) AS n FROM library_sidebar_state WHERE item_type = 'playlist' AND playlist_id = ?").get(Number(plId)),
    ).toMatchObject({ n: 1 });

    await app.inject({ url: `/rest/deletePlaylist.view?${auth}&id=${plId}` });

    expect(
      getDb().prepare("SELECT COUNT(*) AS n FROM library_sidebar_state WHERE item_type = 'playlist' AND playlist_id = ?").get(Number(plId)),
    ).toMatchObject({ n: 0 });
  });
});
