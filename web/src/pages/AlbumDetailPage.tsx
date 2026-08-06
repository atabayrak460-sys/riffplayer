import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAlbum } from '../api/subsonic';
import { usePlayerStore } from '../store/player';
import { useDownloadsStore } from '../store/downloads';
import { CoverArt } from '../components/CoverArt';
import { SongRow } from '../components/SongRow';
import { StarButton } from '../components/StarButton';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';

const ICONS = {
  playNext: 'M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.348a1.875 1.875 0 0 1 0 3.284l-11.54 6.347c-1.25.688-2.779-.215-2.779-1.643V5.653Z',
  queue: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  download: 'M12 3v13.5m0 0-4.5-4.5m4.5 4.5 4.5-4.5M4.5 19.5h15',
  more: 'M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z',
};

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const playQueue = usePlayerStore((s) => s.playQueue);
  const playNext = usePlayerStore((s) => s.playNext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const requestDownload = useDownloadsStore((s) => s.requestDownload);
  const { menu, openAt, close } = useContextMenu();

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

  const menuItems = [
    { label: 'Play next', icon: ICONS.playNext, onClick: () => {
      for (const song of [...songs].reverse()) playNext(song);
    } },
    { label: 'Add to queue', icon: ICONS.queue, onClick: () => {
      for (const song of songs) addToQueue(song);
    } },
    { label: 'Download', icon: ICONS.download, onClick: () => requestDownload({ kind: 'album', songs }) },
  ];

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
            <button
              onClick={(e) => openAt(e, menuItems)}
              title="More options"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d={ICONS.more} />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="space-y-0.5">
        {songs.map((song, i) => (
          <SongRow key={song.id} song={song} queue={songs} index={i + 1} />
        ))}
      </div>

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
