import { useQuery } from '@tanstack/react-query';
import { getAlbumList } from '../api/subsonic';
import { AlbumCard } from '../components/AlbumCard';

export function RecentPage() {
  const { data: recent = [], isLoading: loadingRecent } = useQuery({
    queryKey: ['albums', 'recent'],
    queryFn: () => getAlbumList('recent', { size: 50 }),
  });

  const { data: frequent = [], isLoading: loadingFrequent } = useQuery({
    queryKey: ['albums', 'frequent'],
    queryFn: () => getAlbumList('frequent', { size: 20 }),
  });

  return (
    <div className="p-6 space-y-10">
      <h1 className="text-2xl font-bold text-white">Recently Played</h1>

      {loadingRecent ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square bg-zinc-800 rounded-md animate-pulse" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="text-zinc-400 text-sm">No recently played albums yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {recent.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Most Played</h2>
        {loadingFrequent ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square bg-zinc-800 rounded-md animate-pulse" />
            ))}
          </div>
        ) : frequent.length === 0 ? (
          <p className="text-zinc-400 text-sm">No play history yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {frequent.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
