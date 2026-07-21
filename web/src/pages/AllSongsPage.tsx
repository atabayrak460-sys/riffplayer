import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getAllSongs, getLibraryStats } from '../api/subsonic';
import { SongRow } from '../components/SongRow';
import { AllSongsCover } from '../components/StockCovers';

const PAGE_SIZE = 200;

export function AllSongsPage() {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['all-songs'],
    queryFn: ({ pageParam }) => getAllSongs(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
  });
  const { data: stats } = useQuery({ queryKey: ['library-stats'], queryFn: getLibraryStats });

  const songs = data?.pages.flat() ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <AllSongsCover className="w-16 h-16 rounded-lg shadow-lg flex-shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-white">All Songs</h1>
          {stats && (
            <p className="text-sm text-zinc-400 mt-1">
              Every track in your library · {stats.trackCount.toLocaleString()} songs
            </p>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 bg-zinc-800 rounded-md animate-pulse" />
          ))}
        </div>
      )}

      {isError && <p className="text-red-400 text-sm">Failed to load songs.</p>}

      {!isLoading && !isError && songs.length === 0 && (
        <p className="text-zinc-400 text-sm">No songs found. Try indexing your music library.</p>
      )}

      {songs.length > 0 && (
        <>
          <div className="space-y-0.5">
            {songs.map((song, i) => (
              <SongRow key={song.id} song={song} queue={songs} index={i + 1} showAlbum addedAt={song.created} />
            ))}
          </div>

          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-4 w-full text-sm text-zinc-400 hover:text-white py-2 rounded-md hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
