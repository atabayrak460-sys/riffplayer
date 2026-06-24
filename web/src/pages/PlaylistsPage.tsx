import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlaylists, createPlaylistWithName, deletePlaylist } from '../api/subsonic';

export function PlaylistsPage() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createPlaylistWithName(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setNewName('');
      setCreating(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlaylist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) createMutation.mutate(newName.trim());
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
        <form onSubmit={submit} className="flex gap-2 mb-6">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            autoFocus
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-brand hover:bg-brand-dim text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-zinc-400 hover:text-white text-sm px-3 py-2"
          >
            Cancel
          </button>
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
            <div
              key={pl.id}
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
              <button
                onClick={() => {
                  if (confirm(`Delete "${pl.name}"?`)) deleteMutation.mutate(pl.id);
                }}
                title="Delete playlist"
                className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
