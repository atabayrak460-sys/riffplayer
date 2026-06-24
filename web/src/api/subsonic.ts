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

// ── Playlist management ──────────────────────────────────────────────────────

export async function deletePlaylist(id: string): Promise<void> {
  await get('deletePlaylist.view', { id });
}

export async function createPlaylistWithName(name: string): Promise<Playlist> {
  const r = await get<{ playlist: Playlist }>('createPlaylist.view', { name });
  return r.playlist;
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  await get('updatePlaylist.view', { playlistId, name });
}

// ── Custom /api/v1 endpoints (Subsonic auth via query params) ────────────────

// JWT stored by auth store — set after login
let _jwt: string | null = null;
export function setJwt(token: string | null): void { _jwt = token; }

async function apiCall(
  method: string,
  path: string,
  body?: unknown,
  form?: FormData,
): Promise<unknown> {
  const creds = _creds;
  if (!creds) throw new Error('Not authenticated');
  const base = creds.serverUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {};
  if (_jwt) headers['Authorization'] = `Bearer ${_jwt}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${base}/api/v1/${path}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPut(path: string, body: unknown): Promise<void> {
  await apiCall('PUT', path, body);
}

async function apiPostForm(path: string, form: FormData): Promise<void> {
  await apiCall('POST', path, undefined, form);
}

export async function reorderPlaylistTracks(playlistId: string, trackIds: string[]): Promise<void> {
  await apiPut(`playlists/${playlistId}/tracks`, { trackIds });
}

export async function uploadPlaylistCover(playlistId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await apiPostForm(`playlists/${playlistId}/cover`, form);
}

// ── Lyrics (OpenSubsonic extension) ─────────────────────────────────────────

export interface LyricLine {
  start: number;
  value: string;
}

export interface StructuredLyrics {
  displayArtist: string;
  displayTitle: string;
  lang: string;
  synced: boolean;
  offset: number;
  line: LyricLine[];
}

// ── Admin API ────────────────────────────────────────────────────────────────

export interface AdminUser { id: number; username: string; role: string; created_at: number; }
export interface Library { id: number; name: string; path: string; }

export async function adminGetUsers(): Promise<AdminUser[]> {
  const r = await apiCall('GET', 'admin/users') as { users: AdminUser[] };
  return r.users;
}
export async function adminCreateUser(u: { username: string; password: string; role: string }): Promise<AdminUser> {
  return (await apiCall('POST', 'admin/users', u)) as AdminUser;
}
export async function adminUpdateUser(id: number, u: { password?: string; role?: string }): Promise<void> {
  await apiCall('PATCH', `admin/users/${id}`, u);
}
export async function adminDeleteUser(id: number): Promise<void> {
  await apiCall('DELETE', `admin/users/${id}`);
}

export async function adminGetLibraries(): Promise<Library[]> {
  const r = await apiCall('GET', 'admin/libraries') as { libraries: Library[] };
  return r.libraries;
}
export async function adminAddLibrary(l: { name: string; path: string }): Promise<Library> {
  return (await apiCall('POST', 'admin/libraries', l)) as Library;
}
export async function adminDeleteLibrary(id: number): Promise<void> {
  await apiCall('DELETE', `admin/libraries/${id}`);
}
export async function adminScanLibrary(id: number): Promise<void> {
  await apiCall('POST', `admin/libraries/${id}/scan`);
}

export async function adminGetSettings(): Promise<Record<string, string>> {
  const r = await apiCall('GET', 'admin/settings') as { settings: Record<string, string> };
  return r.settings;
}
export async function adminPatchSettings(patch: Record<string, string | null>): Promise<void> {
  await apiCall('PATCH', 'admin/settings', patch);
}

// ── User preferences ─────────────────────────────────────────────────────────

export async function patchMyPreferences(prefs: Record<string, unknown>): Promise<void> {
  await apiCall('PATCH', 'users/me/preferences', prefs);
}

// ── Lyrics ────────────────────────────────────────────────────────────────────

export async function getLyrics(songId: string): Promise<StructuredLyrics | null> {
  try {
    const r = await get<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>(
      'getLyricsBySongId.view',
      { id: songId },
    );
    return r.lyricsList?.structuredLyrics?.[0] ?? null;
  } catch {
    return null;
  }
}
