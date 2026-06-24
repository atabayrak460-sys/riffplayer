import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getArtist, getAlbum } from '../api/subsonic';
import { usePlayerStore } from '../store/player';
import { CoverArt } from '../components/CoverArt';
import { AlbumCard } from '../components/AlbumCard';
import { StarButton } from '../components/StarButton';

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { playQueue } = usePlayerStore();

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => getArtist(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 bg-zinc-800 rounded animate-pulse w-48 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square bg-zinc-800 rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !artist) {
    return <div className="p-6 text-red-400 text-sm">Artist not found.</div>;
  }

  const albums = artist.album ?? [];

  const playAll = async () => {
    const allSongs = (
      await Promise.all(albums.map((a) => getAlbum(a.id).then((r) => r.song ?? [])))
    ).flat();
    if (allSongs.length) playQueue(allSongs);
  };

  return (
    <div className="p-6">
      <div className="flex items-end gap-5 mb-8">
        <CoverArt
          id={artist.coverArt}
          size={160}
          className="w-32 h-32 rounded-full object-cover shadow-xl flex-shrink-0"
          alt={artist.name}
        />
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400">Artist</p>
          <h1 className="text-3xl font-bold text-white mt-1">{artist.name}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={playAll}
              className="bg-brand hover:bg-brand-dim text-white text-sm font-medium px-5 py-2 rounded-full transition-colors"
            >
              Play all
            </button>
            <StarButton starred={!!artist.starred} opts={{ artistId: artist.id }} />
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest mb-4">Albums</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </div>
    </div>
  );
}
