import { useQuery } from '@tanstack/react-query';
import { getMostPlayed } from '../api/subsonic';
import { SongRow } from '../components/SongRow';
import { MostPlayedCover } from '../components/StockCovers';

export function MostPlayedPage() {
  const { data: songs = [], isLoading } = useQuery({
    queryKey: ['history', 'most-played'],
    queryFn: getMostPlayed,
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <MostPlayedCover className="w-16 h-16 rounded-lg shadow-lg flex-shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-white">Most Played</h1>
          <p className="text-xs text-zinc-500">Last 30 days</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 bg-zinc-800 rounded-md animate-pulse" />
          ))}
        </div>
      ) : songs.length === 0 ? (
        <p className="text-zinc-400 text-sm">No play history in the last 30 days.</p>
      ) : (
        <div className="space-y-0.5">
          {songs.map((song, i) => (
            <SongRow key={song.id} song={song} queue={songs} index={i + 1} showAlbum />
          ))}
        </div>
      )}
    </div>
  );
}
