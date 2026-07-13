import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setCredentials, addSongToPlaylist, renamePlaylist, setPlaylistDescription,
  createPlaylistWithName, getAllSongs,
} from './subsonic';

function mockOkResponse(payload: Record<string, unknown> = { status: 'ok', searchResult3: { song: [] } }) {
  return {
    ok: true,
    json: async () => ({ 'subsonic-response': payload }),
  } as Response;
}

beforeEach(() => {
  setCredentials({ serverUrl: 'http://localhost:4533', username: 'admin', password: 'admin' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockOkResponse()));
});

describe('addSongToPlaylist', () => {
  it('calls updatePlaylist.view with playlistId and songIdToAdd', async () => {
    await addSongToPlaylist('7', '42');

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(url.pathname).toBe('/rest/updatePlaylist.view');
    expect(url.searchParams.get('playlistId')).toBe('7');
    expect(url.searchParams.get('songIdToAdd')).toBe('42');
  });

  it('does not send a name param (would rename the playlist instead of adding a song)', async () => {
    await addSongToPlaylist('7', '42');
    const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(url.searchParams.has('name')).toBe(false);
  });
});

describe('renamePlaylist (regression guard: distinct from addSongToPlaylist)', () => {
  it('sends name but not songIdToAdd', async () => {
    await renamePlaylist('7', 'New Name');
    const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(url.searchParams.get('name')).toBe('New Name');
    expect(url.searchParams.has('songIdToAdd')).toBe(false);
  });
});

describe('setPlaylistDescription', () => {
  it('sends comment (the Subsonic field name for playlist description) but not name', async () => {
    await setPlaylistDescription('7', 'Late night drives');
    const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(url.pathname).toBe('/rest/updatePlaylist.view');
    expect(url.searchParams.get('playlistId')).toBe('7');
    expect(url.searchParams.get('comment')).toBe('Late night drives');
    expect(url.searchParams.has('name')).toBe(false);
  });
});

describe('createPlaylistWithName', () => {
  it('sends only name when no comment is given', async () => {
    await createPlaylistWithName('Road Trip');
    const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(url.pathname).toBe('/rest/createPlaylist.view');
    expect(url.searchParams.get('name')).toBe('Road Trip');
    expect(url.searchParams.has('comment')).toBe(false);
  });

  it('includes comment when a description is given', async () => {
    await createPlaylistWithName('Road Trip', 'Windows down mix');
    const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(url.searchParams.get('comment')).toBe('Windows down mix');
  });
});

describe('getAllSongs', () => {
  it('paginates via search3.view with an empty query and zeroed artist/album counts', async () => {
    await getAllSongs(200, 100);

    const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(url.pathname).toBe('/rest/search3.view');
    expect(url.searchParams.get('query')).toBe('');
    expect(url.searchParams.get('songOffset')).toBe('200');
    expect(url.searchParams.get('songCount')).toBe('100');
    expect(url.searchParams.get('artistCount')).toBe('0');
    expect(url.searchParams.get('albumCount')).toBe('0');
  });

  it('returns an empty array when the server omits the song key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockOkResponse({ status: 'ok', searchResult3: {} })));
    const songs = await getAllSongs(0, 100);
    expect(songs).toEqual([]);
  });
});
