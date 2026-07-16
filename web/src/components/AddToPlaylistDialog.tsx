import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlaylists, addSongToPlaylist } from '../api/subsonic';

interface Props {
  songId: string;
  onClose: () => void;
}

export function AddToPlaylistDialog({ songId, onClose }: Props) {
  const qc = useQueryClient();
  const { data: playlists = [], isLoading } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists });

  const addMutation = useMutation({
    mutationFn: (playlistId: string) => addSongToPlaylist(playlistId, songId),
    onSuccess: (_data, playlistId) => {
      qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 w-full max-w-sm mx-4 max-h-[70vh] flex flex-col"
      >
        <h2 className="text-white font-semibold mb-3">Add to playlist</h2>
        <div className="overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <p className="text-xs text-zinc-500 px-2 py-2">Loading…</p>
          ) : playlists.length === 0 ? (
            <p className="text-xs text-zinc-500 px-2 py-2">No playlists yet</p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => addMutation.mutate(pl.id)}
                disabled={addMutation.isPending}
                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 rounded-md truncate disabled:opacity-50 transition-colors"
              >
                {pl.name}
              </button>
            ))
          )}
        </div>
        <button onClick={onClose} className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 self-start">
          Cancel
        </button>
      </div>
    </div>
  );
}
