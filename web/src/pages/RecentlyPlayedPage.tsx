import { useQuery } from '@tanstack/react-query';
import { getRecentlyPlayed } from '../api/subsonic';
import { SongRow } from '../components/SongRow';
import { RecentlyPlayedCover } from '../components/StockCovers';
import { SystemViewHeader } from '../components/SystemViewHeader';

export function RecentlyPlayedPage() {
  const { data: songs = [], isLoading } = useQuery({
    queryKey: ['history', 'recent'],
    queryFn: getRecentlyPlayed,
  });

  return (
    <div className="p-6">
      <SystemViewHeader
        viewKey="recent"
        title="Recently Played"
        defaultDescription="What you've listened to recently"
        StockCover={RecentlyPlayedCover}
        meta={songs.length > 0 && `${songs.length} track${songs.length === 1 ? '' : 's'}`}
      />

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
