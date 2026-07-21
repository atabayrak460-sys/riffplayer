import { usePlayerStore } from '../../store/player';
import { CoverArt } from '../CoverArt';

export function UpNextSection() {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const next = usePlayerStore((s) => s.next);

  const upNext = queue[queueIndex + 1];
  if (!upNext) return null;

  return (
    <div className="px-4 pb-4 mt-auto">
      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Up next</h3>
      <button
        onClick={next}
        className="group flex items-center gap-3 w-full text-left rounded-md hover:bg-zinc-800/70 p-2 -mx-2 transition-colors"
      >
        <CoverArt
          id={upNext.coverArt}
          size={80}
          className="w-10 h-10 rounded object-cover flex-shrink-0"
          alt={upNext.title}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate group-hover:text-brand transition-colors">
            {upNext.title}
          </p>
          <p className="text-xs text-zinc-400 truncate">{upNext.artist}</p>
        </div>
        <svg className="w-5 h-5 text-zinc-500 group-hover:text-brand flex-shrink-0 transition-colors" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8z M16 6h2v12h-2z" />
        </svg>
      </button>
    </div>
  );
}
