import { useQuery } from '@tanstack/react-query';
import { getRecentlyPlayed } from '../api/subsonic';
import { SongRow } from '../components/SongRow';

export function RecentlyPlayedPage() {
  const { data: songs = [], isLoading } = useQuery({
    queryKey: ['history', 'recent'],
    queryFn: getRecentlyPlayed,
  });

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">Recently Played</h1>

      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 bg-zinc-800 rounded-md animate-pulse" />
          ))}
        </div>
      ) : songs.length === 0 ? (
        <p className="text-zinc-400 text-sm">No recently played tracks yet.</p>
      ) : (
        <div className="space-y-0.5">
          {songs.map((song, i) => (
            <SongRow key={`${song.id}-${i}`} song={song} queue={songs} index={i + 1} showAlbum />
          ))}
        </div>
      )}
    </div>
  );
}
