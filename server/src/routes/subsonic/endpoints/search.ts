import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { escapeLike } from '../../../db/likeEscape.js';
import { toFts5Phrase } from '../../../db/fts5Escape.js';
import { sendOk } from '../response.js';
import { xmlTag, artistAttrs, albumAttrs, songAttrs, toJson, type ArtistRow, type AlbumRow, type SongRow } from '../serialize.js';
import { SONG_SELECT_LIST, SONG_FROM } from './browse.js';

type Q = Record<string, string | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });

// The trigram FTS5 tables (migration 014) can't tokenize anything shorter
// than 3 characters, so a MATCH against a 1-2 character query always
// returns zero rows — fall back to the original LIKE '%...%' scan for
// those (rare, and a short query already matches a lot / scans fast).
const MIN_FTS_QUERY_LENGTH = 3;

const ARTIST_TAIL = `
  a.id, a.name, a.image_path,
  COUNT(DISTINCT al.id) AS albumCount,
  f.created_at AS starred
FROM artists a
LEFT JOIN albums al ON al.artist_id = a.id
LEFT JOIN favorites f ON f.item_type = 'artist' AND f.item_id = a.id AND f.user_id = ?`;

const ALBUM_TAIL = `
  al.id, al.name, al.year, al.cover_path, al.created_at,
  ar.id AS artist_id, ar.name AS artist_name,
  COUNT(t.id) AS songCount,
  COALESCE(SUM(t.duration_s), 0) AS duration,
  f.created_at AS starred
FROM albums al
JOIN artists ar ON ar.id = al.artist_id
LEFT JOIN tracks t ON t.album_id = al.id
LEFT JOIN favorites f ON f.item_type = 'album' AND f.item_id = al.id AND f.user_id = ?`;

const ARTIST_COLS_LIKE = `${ARTIST_TAIL}
WHERE a.name LIKE ? ESCAPE '\\'
GROUP BY a.id
ORDER BY a.name
LIMIT ? OFFSET ?`;

const ARTIST_COLS_FTS = `${ARTIST_TAIL}
JOIN artists_fts ON artists_fts.rowid = a.id
WHERE artists_fts MATCH ?
GROUP BY a.id
ORDER BY a.name
LIMIT ? OFFSET ?`;

const ALBUM_COLS_LIKE = `${ALBUM_TAIL}
WHERE al.name LIKE ? ESCAPE '\\'
GROUP BY al.id
ORDER BY al.name
LIMIT ? OFFSET ?`;

const ALBUM_COLS_FTS = `${ALBUM_TAIL}
JOIN albums_fts ON albums_fts.rowid = al.id
WHERE albums_fts MATCH ?
GROUP BY al.id
ORDER BY al.name
LIMIT ? OFFSET ?`;

const SONG_COLS_LIKE = `${SONG_SELECT_LIST}${SONG_FROM}
WHERE t.title LIKE ? ESCAPE '\\'
ORDER BY t.title
LIMIT ? OFFSET ?`;

const SONG_COLS_FTS = `${SONG_SELECT_LIST}${SONG_FROM}
JOIN tracks_fts ON tracks_fts.rowid = t.id
WHERE tracks_fts MATCH ?
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

  const useFts = query.length >= MIN_FTS_QUERY_LENGTH;
  const matchArg = useFts ? toFts5Phrase(query) : `%${escapeLike(query)}%`;

  const artists = db
    .prepare(`SELECT ${useFts ? ARTIST_COLS_FTS : ARTIST_COLS_LIKE}`)
    .all(userId, matchArg, Number(artistCount), Number(artistOffset)) as ArtistRow[];
  const albums = db
    .prepare(`SELECT ${useFts ? ALBUM_COLS_FTS : ALBUM_COLS_LIKE}`)
    .all(userId, matchArg, Number(albumCount), Number(albumOffset)) as AlbumRow[];
  const songs = db
    .prepare(`SELECT ${useFts ? SONG_COLS_FTS : SONG_COLS_LIKE}`)
    .all(userId, matchArg, Number(songCount), Number(songOffset)) as SongRow[];

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
