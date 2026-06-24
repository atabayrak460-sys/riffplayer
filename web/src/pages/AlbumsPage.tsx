import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAlbumList } from '../api/subsonic';
import { AlbumCard } from '../components/AlbumCard';

const TYPES = [
  { value: 'newest', label: 'Recently Added' },
  { value: 'recent', label: 'Recently Played' },
  { value: 'frequent', label: 'Most Played' },
  { value: 'starred', label: 'Starred' },
  { value: 'alphabeticalByName', label: 'A–Z' },
  { value: 'alphabeticalByArtist', label: 'By Artist' },
  { value: 'random', label: 'Random' },
] as const;

export function AlbumsPage() {
  const [type, setType] = useState<string>('newest');

  const { data: albums = [], isLoading, isError } = useQuery({
    queryKey: ['albums', type],
    queryFn: () => getAlbumList(type, { size: 100 }),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Albums</h1>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand"
        >
          {TYPES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="aspect-square bg-zinc-800 rounded-md animate-pulse" />
              <div className="h-3 bg-zinc-800 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-zinc-800 rounded animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <p className="text-red-400 text-sm">Failed to load albums.</p>
      )}

      {!isLoading && !isError && albums.length === 0 && (
        <p className="text-zinc-400 text-sm">No albums found. Try indexing your music library.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </div>
    </div>
  );
}
