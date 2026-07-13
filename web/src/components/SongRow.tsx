import { usePlayerStore } from '../store/player';
import { StarButton } from './StarButton';
import { AddToPlaylistMenu } from './AddToPlaylistMenu';
import type { Song } from '../api/types';

interface Props {
  song: Song;
  queue?: Song[];
  index?: number;
  showAlbum?: boolean;
}

function formatDuration(s?: number) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function SongRow({ song, queue, index, showAlbum = false }: Props) {
  const { playSong, currentSong, playing } = usePlayerStore();
  const isCurrent = currentSong?.id === song.id;

  const play = () => playSong(song, queue);

  return (
    <div
      onDoubleClick={play}
      className={`group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800/70 cursor-pointer transition-colors ${isCurrent ? 'bg-zinc-800' : ''}`}
    >
      {/* Track number / play indicator */}
      <div className="w-7 text-center flex-shrink-0">
        {isCurrent ? (
          <span className="text-brand text-sm">{playing ? '▶' : '❚❚'}</span>
        ) : (
          <span className="text-zinc-500 text-sm group-hover:hidden">{index ?? ''}</span>
        )}
        <button
          onClick={play}
          className={`text-zinc-200 text-sm ${isCurrent ? 'hidden' : 'hidden group-hover:block'}`}
        >
          ▶
        </button>
      </div>

      {/* Title + artist */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrent ? 'text-brand' : 'text-white'}`}>
          {song.title}
        </p>
        {showAlbum && (
          <p className="text-xs text-zinc-400 truncate">
            {song.artist} · {song.album}
          </p>
        )}
        {!showAlbum && <p className="text-xs text-zinc-400 truncate">{song.artist}</p>}
      </div>

      {/* Duration + star + add-to-playlist */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <AddToPlaylistMenu songId={song.id} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        <StarButton starred={!!song.starred} opts={{ id: song.id }} />
        <span className="text-sm text-zinc-400 w-10 text-right">
          {formatDuration(song.duration)}
        </span>
      </div>
    </div>
  );
}
