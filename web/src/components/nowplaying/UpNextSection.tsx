import { usePlayerStore } from '../../store/player';
import { SongRow } from '../SongRow';

export function UpNextSection() {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);

  const upNext = queue.slice(queueIndex + 1);
  if (upNext.length === 0) return null;

  return (
    <div className="px-4 pb-4 mt-auto">
      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Up next</h3>
      {/* Capped height to roughly 5 rows — the rest of the queue scrolls
          within this list instead of pushing the panel's other sections
          (hero/album/artist tracks above) further down. */}
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {upNext.map((track, i) => (
          <SongRow key={`${track.id}-${i}`} song={track} queue={queue} index={i + 1} condensed />
        ))}
      </div>
    </div>
  );
}
