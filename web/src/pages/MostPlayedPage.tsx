import { useQuery } from '@tanstack/react-query';
import { getMostPlayed } from '../api/subsonic';
import { SongRow } from '../components/SongRow';
import { MostPlayedCover } from '../components/StockCovers';
import { SystemViewHeader } from '../components/SystemViewHeader';

export function MostPlayedPage() {
  const { data: songs = [], isLoading } = useQuery({
    queryKey: ['history', 'most-played'],
    queryFn: getMostPlayed,
  });

  return (
    <div className="p-6">
      <SystemViewHeader
        viewKey="most-played"
        title="Most Played"
        defaultDescription="Your top tracks based on play history"
        StockCover={MostPlayedCover}
        meta={songs.length > 0 && `${songs.length} track${songs.length === 1 ? '' : 's'} · last 30 days`}
      />

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
