import { useQuery } from '@tanstack/react-query';
import { getRecentlyPlayed } from '../api/subsonic';
import { SongRow } from '../components/SongRow';
import { RecentlyPlayedCover } from '../components/StockCovers';

export function RecentlyPlayedPage() {
  const { data: songs = [], isLoading } = useQuery({
    queryKey: ['history', 'recent'],
    queryFn: getRecentlyPlayed,
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <RecentlyPlayedCover className="w-16 h-16 rounded-lg shadow-lg flex-shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-white">Recently Played</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {songs.length > 0
              ? `Your last ${songs.length} played track${songs.length === 1 ? '' : 's'}`
              : "What you've listened to recently"}
          </p>
        </div>
      </div>

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
