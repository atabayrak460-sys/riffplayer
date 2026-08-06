import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from 'idb';
import {
  _resetForTests,
  saveTrack,
  releaseTrack,
  getAllDownloadedTracks,
  isTrackDownloaded,
  saveCoverBlob,
  getCoverBlob,
  savePlaylist,
  removePlaylistDownload,
  reconcileEvictedTracks,
  getTracksByIds,
  getTrackAudioBlob,
} from './offlineDb';
import type { Song } from '../api/types';

function song(id: string): Song {
  return {
    id, title: `Track ${id}`, album: 'Album', albumId: 'al-1', artist: 'Artist', artistId: 'ar-1',
    coverArt: 'al-1', created: '2024-01-01', isVideo: false, type: 'music',
  };
}

const BLOB = new Blob(['audio-bytes'], { type: 'audio/mpeg' });

beforeEach(async () => {
  await _resetForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('cadence-offline');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe('saveTrack / getAllDownloadedTracks / isTrackDownloaded', () => {
  it('saves a track and makes it visible as downloaded', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    expect(await isTrackDownloaded('1')).toBe(true);
    const all = await getAllDownloadedTracks();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('1');
    expect(all[0].retainedBy).toEqual(['individual']);
    expect(all[0].sizeBytes).toBe(BLOB.size);
  });

  it('a track not saved is not downloaded', async () => {
    expect(await isTrackDownloaded('nope')).toBe(false);
  });

  it('saving the same track under a second tag merges retainedBy instead of duplicating', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');
    const all = await getAllDownloadedTracks();
    expect(all).toHaveLength(1);
    expect(all[0].retainedBy.sort()).toEqual(['individual', 'playlist:42'].sort());
  });
});

describe('releaseTrack', () => {
  it('removes the track entirely once its last retain tag is released', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await releaseTrack('1', 'individual');
    expect(await isTrackDownloaded('1')).toBe(false);
    expect(await getAllDownloadedTracks()).toHaveLength(0);
  });

  it('keeps the track if another retain tag still applies', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');
    await releaseTrack('1', 'individual');
    expect(await isTrackDownloaded('1')).toBe(true);
    const all = await getAllDownloadedTracks();
    expect(all[0].retainedBy).toEqual(['playlist:42']);
  });

  it('is a no-op for a track that was never saved', async () => {
    await expect(releaseTrack('missing', 'individual')).resolves.not.toThrow();
  });
});

describe('cover blobs', () => {
  it('round-trips a cover blob', async () => {
    const cover = new Blob(['img'], { type: 'image/png' });
    await saveCoverBlob('al-1', cover, 'image/png');
    const got = await getCoverBlob('al-1');
    expect(got).not.toBeNull();
    expect(got!.size).toBe(cover.size);
  });

  it('returns null for a cover that was never saved', async () => {
    expect(await getCoverBlob('al-999')).toBeNull();
  });
});

describe('playlists', () => {
  it('downloading a playlist retains its tracks, and removing it releases them', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');
    await saveTrack(song('2'), BLOB, 'audio/mpeg', 'playlist:42');
    await savePlaylist({
      id: '42', name: 'Road Trip', downloadedAt: Date.now(), trackIds: ['1', '2'],
    });

    expect(await isTrackDownloaded('1')).toBe(true);
    expect(await isTrackDownloaded('2')).toBe(true);

    await removePlaylistDownload('42');

    expect(await isTrackDownloaded('1')).toBe(false);
    expect(await isTrackDownloaded('2')).toBe(false);
  });

  it('does not remove a track still individually downloaded when its playlist download is removed', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');
    await savePlaylist({ id: '42', name: 'Road Trip', downloadedAt: Date.now(), trackIds: ['1'] });

    await removePlaylistDownload('42');

    expect(await isTrackDownloaded('1')).toBe(true);
    const all = await getAllDownloadedTracks();
    expect(all[0].retainedBy).toEqual(['individual']);
  });

  it('does not remove a track still needed by a different downloaded playlist', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:43');
    await savePlaylist({ id: '42', name: 'A', downloadedAt: Date.now(), trackIds: ['1'] });
    await savePlaylist({ id: '43', name: 'B', downloadedAt: Date.now(), trackIds: ['1'] });

    await removePlaylistDownload('42');

    // Not just "still downloaded" — the removed playlist's tag must actually
    // be gone from retainedBy, leaving exactly the other playlist's tag.
    expect(await isTrackDownloaded('1')).toBe(true);
    const all = await getAllDownloadedTracks();
    expect(all[0].retainedBy).toEqual(['playlist:43']);
  });
});

describe('multi-tag retain/release interaction (#4.9)', () => {
  it('releases the audio blob only once every retain tag is gone, in either removal order', async () => {
    // Order 1: playlist tag released first, then the individual one.
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');

    await releaseTrack('1', 'playlist:42');
    expect(await isTrackDownloaded('1')).toBe(true);
    expect((await getTrackAudioBlob('1'))?.blob.size).toBe(BLOB.size);

    await releaseTrack('1', 'individual');
    expect(await isTrackDownloaded('1')).toBe(false);
    expect(await getTrackAudioBlob('1')).toBeNull();
    expect(await getAllDownloadedTracks()).toHaveLength(0);
  });

  it('releases the audio blob only once every retain tag is gone, in the reverse order', async () => {
    // Order 2: individual tag released first, then the playlist one — via
    // removePlaylistDownload, mirroring how the UI actually removes a
    // playlist's offline copy rather than calling releaseTrack directly.
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');
    await savePlaylist({ id: '42', name: 'Road Trip', downloadedAt: Date.now(), trackIds: ['1'] });

    await releaseTrack('1', 'individual');
    expect(await isTrackDownloaded('1')).toBe(true);
    expect((await getTrackAudioBlob('1'))?.blob.size).toBe(BLOB.size);

    await removePlaylistDownload('42');
    expect(await isTrackDownloaded('1')).toBe(false);
    expect(await getTrackAudioBlob('1')).toBeNull();
  });

  it('a track retained three ways (individual + two playlists) survives until the last tag is released', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:43');
    let all = await getAllDownloadedTracks();
    expect(all[0].retainedBy.sort()).toEqual(['individual', 'playlist:42', 'playlist:43']);

    await releaseTrack('1', 'playlist:42');
    all = await getAllDownloadedTracks();
    expect(all[0].retainedBy.sort()).toEqual(['individual', 'playlist:43']);
    expect(await isTrackDownloaded('1')).toBe(true);

    await releaseTrack('1', 'individual');
    all = await getAllDownloadedTracks();
    expect(all[0].retainedBy).toEqual(['playlist:43']);
    expect(await isTrackDownloaded('1')).toBe(true);

    await releaseTrack('1', 'playlist:43');
    expect(await isTrackDownloaded('1')).toBe(false);
    expect(await getTrackAudioBlob('1')).toBeNull();
  });

  it('re-releasing an already-removed tag is a no-op and does not affect the remaining tag', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'playlist:42');

    await releaseTrack('1', 'individual');
    await releaseTrack('1', 'individual'); // already gone — must not touch playlist:42's retention

    expect(await isTrackDownloaded('1')).toBe(true);
    const all = await getAllDownloadedTracks();
    expect(all[0].retainedBy).toEqual(['playlist:42']);
  });
});

describe('getTracksByIds', () => {
  it('returns tracks in the requested order, skipping ids that are not downloaded', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('2'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('3'), BLOB, 'audio/mpeg', 'individual');

    const result = await getTracksByIds(['3', 'missing', '1']);
    expect(result.map((t) => t.id)).toEqual(['3', '1']);
  });
});

describe('reconcileEvictedTracks', () => {
  it('drops track metadata whose blob has been evicted, and leaves intact tracks alone', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    await saveTrack(song('2'), BLOB, 'audio/mpeg', 'individual');

    // Simulate the browser silently evicting one track's blob (e.g. iOS Safari
    // storage pressure) while its metadata row survives.
    const db = await openDB('cadence-offline', 1);
    await db.delete('trackBlobs', '1');
    db.close();
    await _resetForTests();

    const dropped = await reconcileEvictedTracks();
    expect(dropped).toEqual(['1']);
    expect(await isTrackDownloaded('1')).toBe(false);
    expect(await isTrackDownloaded('2')).toBe(true);
  });

  it('returns an empty list when nothing was evicted', async () => {
    await saveTrack(song('1'), BLOB, 'audio/mpeg', 'individual');
    expect(await reconcileEvictedTracks()).toEqual([]);
  });
});
