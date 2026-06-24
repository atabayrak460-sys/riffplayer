import md5 from 'blueimp-md5';
import type {
  Album,
  Artist,
  ArtistIndex,
  Credentials,
  Playlist,
  SearchResult,
  Song,
} from './types';

const CLIENT = 'cadence-web';
const VERSION = '1.16.1';

let _creds: Credentials | null = null;

export function setCredentials(creds: Credentials): void {
  _creds = creds;
}

export function getCredentials(): Credentials | null {
  return _creds;
}

export function clearCredentials(): void {
  _creds = null;
}

function randomSalt(): string {
  return Math.random().toString(36).slice(2, 10);
}

function authParams(creds: Credentials): URLSearchParams {
  const s = randomSalt();
  const t = md5(creds.password + s);
  const p = new URLSearchParams();
  p.set('u', creds.username);
  p.set('t', t);
  p.set('s', s);
  p.set('v', VERSION);
  p.set('c', CLIENT);
  p.set('f', 'json');
  return p;
}

/** Build a URL for endpoints that are used as media src (stream, cover art). */
export function mediaUrl(path: string, extra: Record<string, string> = {}): string {
  const creds = _creds;
  if (!creds) return '';
  const base = creds.serverUrl.replace(/\/$/, '');
  const params = authParams(creds);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return `${base}/rest/${path}?${params}`;
}

export function coverArtUrl(id: string, size?: number): string {
  const extra: Record<string, string> = { id };
  if (size) extra.size = String(size);
  return mediaUrl('getCoverArt.view', extra);
}

export function streamUrl(id: string): string {
  return mediaUrl('stream.view', { id });
}

async function get<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
  const creds = _creds;
  if (!creds) throw new Error('Not authenticated');
  const base = creds.serverUrl.replace(/\/$/, '');
  const params = authParams(creds);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);

  const res = await fetch(`${base}/rest/${path}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as Record<string, unknown>;
  const sr = json['subsonic-response'] as Record<string, unknown>;
  if (sr.status !== 'ok') {
    const err = sr.error as Record<string, unknown> | undefined;
    throw new Error((err?.message as string) ?? 'Subsonic error');
  }
  return sr as T;
}

// ── Ping ────────────────────────────────────────────────────────────────────

export async function ping(): Promise<void> {
  await get('ping.view');
}

// ── Browse ──────────────────────────────────────────────────────────────────

export async function getArtists(): Promise<ArtistIndex[]> {
  const r = await get<{ artists: { index: ArtistIndex[] } }>('getArtists.view');
  return r.artists.index;
}

export async function getArtist(id: string): Promise<Artist & { album: Album[] }> {
  const r = await get<{ artist: Artist & { album: Album[] } }>('getArtist.view', { id });
  return r.artist;
}

export async function getAlbumList(
  type: string,
  opts: { size?: number; offset?: number; fromYear?: number; toYear?: number } = {},
): Promise<Album[]> {
  const extra: Record<string, string> = { type, size: String(opts.size ?? 50) };
  if (opts.offset) extra.offset = String(opts.offset);
  if (opts.fromYear != null) extra.fromYear = String(opts.fromYear);
  if (opts.toYear != null) extra.toYear = String(opts.toYear);
  const r = await get<{ albumList2: { album: Album[] } }>('getAlbumList2.view', extra);
  return r.albumList2.album ?? [];
}

export async function getAlbum(id: string): Promise<Album & { song: Song[] }> {
  const r = await get<{ album: Album & { song: Song[] } }>('getAlbum.view', { id });
  return r.album;
}

export async function getSong(id: string): Promise<Song> {
  const r = await get<{ song: Song }>('getSong.view', { id });
  return r.song;
}

// ── Search ──────────────────────────────────────────────────────────────────

export async function search(query: string): Promise<SearchResult> {
  const r = await get<{ searchResult3: SearchResult }>('search3.view', {
    query,
    artistCount: '10',
    albumCount: '20',
    songCount: '30',
  });
  return {
    artist: r.searchResult3.artist ?? [],
    album: r.searchResult3.album ?? [],
    song: r.searchResult3.song ?? [],
  };
}

// ── Favorites ───────────────────────────────────────────────────────────────

export async function getStarred(): Promise<{ artist: Artist[]; album: Album[]; song: Song[] }> {
  const r = await get<{ starred2: { artist: Artist[]; album: Album[]; song: Song[] } }>(
    'getStarred2.view',
  );
  return {
    artist: r.starred2.artist ?? [],
    album: r.starred2.album ?? [],
    song: r.starred2.song ?? [],
  };
}

export async function star(opts: { id?: string; albumId?: string; artistId?: string }): Promise<void> {
  const extra: Record<string, string> = {};
  if (opts.id) extra.id = opts.id;
  if (opts.albumId) extra.albumId = opts.albumId;
  if (opts.artistId) extra.artistId = opts.artistId;
  await get('star.view', extra);
}

export async function unstar(opts: { id?: string; albumId?: string; artistId?: string }): Promise<void> {
  const extra: Record<string, string> = {};
  if (opts.id) extra.id = opts.id;
  if (opts.albumId) extra.albumId = opts.albumId;
  if (opts.artistId) extra.artistId = opts.artistId;
  await get('unstar.view', extra);
}

// ── Playlists ────────────────────────────────────────────────────────────────

export async function getPlaylists(): Promise<Playlist[]> {
  const r = await get<{ playlists: { playlist: Playlist[] } }>('getPlaylists.view');
  return r.playlists.playlist ?? [];
}

export async function getPlaylist(id: string): Promise<Playlist> {
  const r = await get<{ playlist: Playlist }>('getPlaylist.view', { id });
  return r.playlist;
}

// ── Scrobble ────────────────────────────────────────────────────────────────

export async function scrobble(id: string, submission = true): Promise<void> {
  await get('scrobble.view', { id, submission: String(submission) });
}
