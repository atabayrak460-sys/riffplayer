import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendOk, sendError, SubsonicErrorCode } from '../response.js';
import { xmlTag, artistAttrs, albumAttrs, songAttrs, toJson, type ArtistRow, type AlbumRow, type SongRow } from '../serialize.js';

type Q = Record<string, string | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });

type ItemType = 'artist' | 'album' | 'track';

function resolveItemType(req: FastifyRequest): { type: ItemType; id: number } | null {
  const { id, albumId, artistId } = p(req);
  if (artistId) return { type: 'artist', id: Number(artistId) };
  if (albumId)  return { type: 'album',  id: Number(albumId) };
  if (id)       return { type: 'track',  id: Number(id) };
  return null;
}

function star(req: FastifyRequest, reply: FastifyReply): void {
  const { f } = p(req);
  const item = resolveItemType(req);
  if (!item) return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id, albumId, or artistId required' });

  getDb()
    .prepare('INSERT OR IGNORE INTO favorites (user_id, item_type, item_id) VALUES (?, ?, ?)')
    .run(req.subsonicUser!.id, item.type, item.id);

  sendOk(reply, f);
}

function unstar(req: FastifyRequest, reply: FastifyReply): void {
  const { f } = p(req);
  const item = resolveItemType(req);
  if (!item) return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id, albumId, or artistId required' });

  getDb()
    .prepare('DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?')
    .run(req.subsonicUser!.id, item.type, item.id);

  sendOk(reply, f);
}

function getStarred2(req: FastifyRequest, reply: FastifyReply): void {
  const { f } = p(req);
  const db = getDb();
  const userId = req.subsonicUser!.id;

  const artists = db.prepare(`
    SELECT a.id, a.name, a.image_path,
           COUNT(DISTINCT al.id) AS albumCount,
           fav.created_at AS starred
    FROM favorites fav
    JOIN artists a ON a.id = fav.item_id
    LEFT JOIN albums al ON al.artist_id = a.id
    LEFT JOIN favorites f ON f.item_type = 'artist' AND f.item_id = a.id AND f.user_id = ?
    WHERE fav.user_id = ? AND fav.item_type = 'artist'
    GROUP BY a.id
    ORDER BY a.name
  `).all(userId, userId) as ArtistRow[];

  const albums = db.prepare(`
    SELECT al.id, al.name, al.year, al.cover_path, al.created_at,
           ar.id AS artist_id, ar.name AS artist_name,
           COUNT(t.id) AS songCount,
           COALESCE(SUM(t.duration_s), 0) AS duration,
           fav.created_at AS starred
    FROM favorites fav
    JOIN albums al ON al.id = fav.item_id
    JOIN artists ar ON ar.id = al.artist_id
    LEFT JOIN tracks t ON t.album_id = al.id
    WHERE fav.user_id = ? AND fav.item_type = 'album'
    GROUP BY al.id
    ORDER BY al.name
  `).all(userId) as AlbumRow[];

  const songs = db.prepare(`
    SELECT t.id, t.title, t.track_no, t.disc_no, t.duration_s, t.size, t.bitrate,
           t.format, t.path, t.added_at, t.album_id, t.artist_id,
           ar.name AS artist_name, al.name AS album_name, al.year,
           fav.created_at AS starred
    FROM favorites fav
    JOIN tracks t ON t.id = fav.item_id
    JOIN artists ar ON ar.id = t.artist_id
    JOIN albums al ON al.id = t.album_id
    WHERE fav.user_id = ? AND fav.item_type = 'track'
    ORDER BY t.title
  `).all(userId) as SongRow[];

  sendOk(reply, f, {
    xml: xmlTag('starred2', {},
      artists.map((a) => xmlTag('artist', artistAttrs(a))).join('') +
      albums.map((a) => xmlTag('album', albumAttrs(a))).join('') +
      songs.map((s) => xmlTag('song', songAttrs(s))).join(''),
    ),
    json: {
      starred2: {
        artist: artists.map((a) => toJson(artistAttrs(a))),
        album:  albums.map((a) => toJson(albumAttrs(a))),
        song:   songs.map((s) => toJson(songAttrs(s))),
      },
    },
  });
}

export async function favoritesPlugin(app: FastifyInstance): Promise<void> {
  app.route({ method: ['GET', 'POST'], url: '/star.view', handler: star });
  app.route({ method: ['GET', 'POST'], url: '/unstar.view', handler: unstar });
  app.route({ method: ['GET', 'POST'], url: '/getStarred2.view', handler: getStarred2 });
}
