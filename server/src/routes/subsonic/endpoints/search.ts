import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { escapeLike } from '../../../db/likeEscape.js';
import { sendOk } from '../response.js';
import { xmlTag, artistAttrs, albumAttrs, songAttrs, toJson, type ArtistRow, type AlbumRow, type SongRow } from '../serialize.js';

type Q = Record<string, string | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });

const ARTIST_COLS = `
  a.id, a.name, a.image_path,
  COUNT(DISTINCT al.id) AS albumCount,
  f.created_at AS starred
FROM artists a
LEFT JOIN albums al ON al.artist_id = a.id
LEFT JOIN favorites f ON f.item_type = 'artist' AND f.item_id = a.id AND f.user_id = ?
WHERE a.name LIKE ? ESCAPE '\\'
GROUP BY a.id
ORDER BY a.name
LIMIT ? OFFSET ?`;

const ALBUM_COLS = `
  al.id, al.name, al.year, al.cover_path, al.created_at,
  ar.id AS artist_id, ar.name AS artist_name,
  COUNT(t.id) AS songCount,
  COALESCE(SUM(t.duration_s), 0) AS duration,
  f.created_at AS starred
FROM albums al
JOIN artists ar ON ar.id = al.artist_id
LEFT JOIN tracks t ON t.album_id = al.id
LEFT JOIN favorites f ON f.item_type = 'album' AND f.item_id = al.id AND f.user_id = ?
WHERE al.name LIKE ? ESCAPE '\\'
GROUP BY al.id
ORDER BY al.name
LIMIT ? OFFSET ?`;

const SONG_COLS = `
  t.id, t.title, t.track_no, t.disc_no, t.duration_s, t.size, t.bitrate,
  t.format, t.path, t.added_at, t.album_id, t.artist_id,
  t.replaygain_track, t.replaygain_album,
  ar.name AS artist_name, al.name AS album_name, al.year,
  f.created_at AS starred
FROM tracks t
JOIN artists ar ON ar.id = t.artist_id
JOIN albums al ON al.id = t.album_id
LEFT JOIN favorites f ON f.item_type = 'track' AND f.item_id = t.id AND f.user_id = ?
WHERE t.title LIKE ? ESCAPE '\\'
ORDER BY t.title
LIMIT ? OFFSET ?`;

function search3(req: FastifyRequest, reply: FastifyReply): void {
  const {
    f,
    query = '',
    artistCount = '20', artistOffset = '0',
    albumCount = '20',  albumOffset = '0',
    songCount = '20',   songOffset = '0',
  } = p(req);

  const db = getDb();
  const userId = req.subsonicUser!.id;
  const like = `%${escapeLike(query)}%`;

  const artists = db.prepare(`SELECT ${ARTIST_COLS}`).all(userId, like, Number(artistCount), Number(artistOffset)) as ArtistRow[];
  const albums  = db.prepare(`SELECT ${ALBUM_COLS}`).all(userId, like, Number(albumCount), Number(albumOffset)) as AlbumRow[];
  const songs   = db.prepare(`SELECT ${SONG_COLS}`).all(userId, like, Number(songCount), Number(songOffset)) as SongRow[];

  sendOk(reply, f, {
    xml: xmlTag('searchResult3', {},
      artists.map((a) => xmlTag('artist', artistAttrs(a))).join('') +
      albums.map((a) => xmlTag('album', albumAttrs(a))).join('') +
      songs.map((s) => xmlTag('song', songAttrs(s))).join(''),
    ),
    json: {
      searchResult3: {
        artist: artists.map((a) => toJson(artistAttrs(a))),
        album:  albums.map((a) => toJson(albumAttrs(a))),
        song:   songs.map((s) => toJson(songAttrs(s))),
      },
    },
  });
}

export async function searchPlugin(app: FastifyInstance): Promise<void> {
  app.route({ method: ['GET', 'POST'], url: '/search3.view', handler: search3 });
}
