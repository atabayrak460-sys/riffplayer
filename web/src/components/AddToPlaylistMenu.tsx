import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlaylists, addSongToPlaylist } from '../api/subsonic';

interface Props {
  songId: string;
  className?: string;
}

export function AddToPlaylistMenu({ songId, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: (playlistId: string) => addSongToPlaylist(playlistId, songId),
    onSuccess: (_data, playlistId) => {
      qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
      setOpen(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Add to playlist"
        className="text-zinc-400 hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 py-1 max-h-64 overflow-y-auto"
        >
          {isLoading ? (
            <p className="px-3 py-2 text-xs text-zinc-500">Loading…</p>
          ) : playlists.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">No playlists yet</p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => addMutation.mutate(pl.id)}
                disabled={addMutation.isPending}
                className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 truncate disabled:opacity-50"
              >
                {pl.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
