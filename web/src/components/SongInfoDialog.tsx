import type { Song } from '../api/types';
import { Modal } from './Modal';

interface Props {
  song: Song;
  onClose: () => void;
}

function formatDuration(s?: number) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function SongInfoDialog({ song, onClose }: Props) {
  const rows: [string, string][] = [
    ['Title', song.title],
    ['Artist', song.artist],
    ['Album', song.album],
    ['Duration', formatDuration(song.duration)],
  ];
  if (song.suffix) rows.push(['Format', song.suffix.toUpperCase()]);
  if (song.bitRate) rows.push(['Bitrate', `${song.bitRate} kbps`]);
  if (song.playCount != null) rows.push(['Play count', String(song.playCount)]);

  return (
    <Modal onClose={onClose} label="Song info" className="p-5 w-full max-w-sm">
      <h2 className="text-white font-semibold mb-4">Song info</h2>
      <dl className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 text-sm">
            <dt className="text-zinc-400">{label}</dt>
            <dd className="text-white text-right truncate">{value}</dd>
          </div>
        ))}
      </dl>
      <button onClick={onClose} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">
        Close
      </button>
    </Modal>
  );
}
