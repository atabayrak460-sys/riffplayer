import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAlbum } from '../api/subsonic';
import { usePlayerStore } from '../store/player';
import { CoverArt } from '../components/CoverArt';
import { SongRow } from '../components/SongRow';
import { StarButton } from '../components/StarButton';

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { playQueue } = usePlayerStore();

  const { data: album, isLoading, isError } = useQuery({
    queryKey: ['album', id],
    queryFn: () => getAlbum(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 flex gap-6">
        <div className="w-48 h-48 bg-zinc-800 rounded-lg animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="h-7 bg-zinc-800 rounded animate-pulse w-48" />
          <div className="h-4 bg-zinc-800 rounded animate-pulse w-32" />
        </div>
      </div>
    );
  }

  if (isError || !album) {
    return <div className="p-6 text-red-400 text-sm">Album not found.</div>;
  }

  const songs = album.song ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex gap-6 mb-8">
        <CoverArt
          id={album.coverArt}
          size={300}
          className="w-48 h-48 rounded-lg shadow-xl flex-shrink-0 object-cover"
          alt={album.name}
        />
        <div className="flex flex-col justify-end gap-2">
          <p className="text-xs uppercase tracking-widest text-zinc-400">Album</p>
          <h1 className="text-3xl font-bold text-white">{album.name}</h1>
          <p className="text-zinc-300">{album.artist}</p>
          <p className="text-sm text-zinc-500">
            {album.year && `${album.year} · `}{songs.length} tracks · {formatDuration(album.duration)}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => playQueue(songs)}
              className="bg-brand hover:bg-brand-dim text-white text-sm font-medium px-5 py-2 rounded-full transition-colors"
            >
              Play
            </button>
            <StarButton starred={!!album.starred} opts={{ albumId: album.id }} />
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="space-y-0.5">
        {songs.map((song, i) => (
          <SongRow key={song.id} song={song} queue={songs} index={i + 1} />
        ))}
      </div>
    </div>
  );
}
