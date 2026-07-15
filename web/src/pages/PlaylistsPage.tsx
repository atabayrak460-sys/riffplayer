import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlaylists, getPlaylist, createPlaylistWithName, uploadPlaylistCover, deletePlaylist } from '../api/subsonic';
import { useDownloadsStore } from '../store/downloads';
import { DownloadButton } from '../components/DownloadButton';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import type { Playlist } from '../api/types';

function PlaylistRow({ pl, onDelete }: { pl: Playlist; onDelete: () => void }) {
  const downloadState = useDownloadsStore((s) => s.playlistState(pl.id));
  const requestDownload = useDownloadsStore((s) => s.requestDownload);
  const removePlaylistDownload = useDownloadsStore((s) => s.removePlaylistDownload);
  const { menu, handlers, close } = useContextMenu();

  const startDownload = async () => {
    const full = await getPlaylist(pl.id);
    requestDownload({ kind: 'playlist', playlist: full, songs: full.entry ?? [] });
  };

  const contextItems = downloadState === 'downloaded'
    ? [{ label: 'Remove download', onClick: () => removePlaylistDownload(pl.id), danger: true }]
    : [{ label: 'Download', onClick: startDownload }];

  return (
    <div
      {...handlers(contextItems)}
      className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-zinc-800 group"
    >
      <Link to={`/playlists/${pl.id}`} className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white group-hover:text-brand transition-colors truncate">
          {pl.name}
        </p>
        <p className="text-xs text-zinc-400">
          {pl.songCount} {pl.songCount === 1 ? 'track' : 'tracks'}
        </p>
      </Link>
      <DownloadButton
        state={downloadState}
        onDownload={startDownload}
        onRemove={() => removePlaylistDownload(pl.id)}
      />
      <button
        onClick={() => {
          if (confirm(`Delete "${pl.name}"?`)) onDelete();
        }}
        title="Delete playlist"
        className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      </button>
      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}

export function PlaylistsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, comment, cover }: { name: string; comment: string; cover: File | null }) => {
      const playlist = await createPlaylistWithName(name, comment || undefined);
      if (cover) {
        // Best-effort: the playlist itself is already created either way, and its
        // cover can always be set later from the playlist detail page.
        await uploadPlaylistCover(playlist.id, cover).catch(() => {});
      }
      return playlist;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setNewName('');
      setNewDescription('');
      setNewCoverFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setCreating(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlaylist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      createMutation.mutate({ name: newName.trim(), comment: newDescription.trim(), cover: newCoverFile });
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Playlists</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="bg-brand hover:bg-brand-dim text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New playlist
        </button>
      </div>

      {creating && (
        <form onSubmit={submit} className="flex flex-col gap-3 mb-6 bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            autoFocus
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-brand"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm text-zinc-300 hover:text-white bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
            >
              {newCoverFile ? 'Change cover…' : 'Choose cover…'}
            </button>
            {newCoverFile && (
              <span className="text-xs text-zinc-400 truncate max-w-[12rem]">{newCoverFile.name}</span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setNewCoverFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending || !newName.trim()}
              className="bg-brand hover:bg-brand-dim text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-zinc-400 hover:text-white text-sm px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <p className="text-zinc-400 text-sm">No playlists yet.</p>
      ) : (
        <div className="space-y-1">
          {playlists.map((pl) => (
            <PlaylistRow key={pl.id} pl={pl} onDelete={() => deleteMutation.mutate(pl.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
