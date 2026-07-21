import { useQuery } from '@tanstack/react-query';
import { getAlbum } from '../../api/subsonic';
import { SongRow } from '../SongRow';
import type { Song } from '../../api/types';

export function AlbumTracksSection({ song }: { song: Song }) {
  // Same query key AlbumDetailPage uses — shares its cache.
  const { data: album } = useQuery({
    queryKey: ['album', song.albumId],
    queryFn: () => getAlbum(song.albumId),
  });

  const tracks = album?.song ?? [];
  const others = tracks.filter((t) => t.id !== song.id);
  if (others.length === 0) return null;

  return (
    <div className="px-4 pb-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">More from this album</h3>
      <div className="space-y-0.5">
        {others.map((track) => (
          <SongRow
            key={track.id}
            song={track}
            queue={tracks}
            index={tracks.findIndex((t) => t.id === track.id) + 1}
            condensed
          />
        ))}
      </div>
    </div>
  );
}
