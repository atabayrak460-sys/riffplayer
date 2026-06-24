import { useState } from 'react';
import { star, unstar } from '../api/subsonic';

interface Props {
  starred: boolean;
  onToggle?: (nowStarred: boolean) => void;
  opts: { id?: string; albumId?: string; artistId?: string };
  className?: string;
}

export function StarButton({ starred: initialStarred, onToggle, opts, className = '' }: Props) {
  const [starred, setStarred] = useState(initialStarred);
  const [loading, setLoading] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      if (starred) {
        await unstar(opts);
        setStarred(false);
        onToggle?.(false);
      } else {
        await star(opts);
        setStarred(true);
        onToggle?.(true);
      }
    } catch {
      // ignore — UI stays as-is
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      title={starred ? 'Remove from favourites' : 'Add to favourites'}
      className={`text-zinc-400 hover:text-brand transition-colors ${starred ? 'text-brand' : ''} ${className}`}
    >
      <svg className="w-5 h-5" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
      </svg>
    </button>
  );
}
