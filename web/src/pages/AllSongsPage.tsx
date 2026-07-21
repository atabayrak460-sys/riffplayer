import { useInfiniteQuery } from '@tanstack/react-query';
import { getAllSongs } from '../api/subsonic';
import { SongRow } from '../components/SongRow';

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

  const songs = data?.pages.flat() ?? [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">All Songs</h1>

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
