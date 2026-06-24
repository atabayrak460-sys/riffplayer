import { useState } from 'react';
import { coverArtUrl } from '../api/subsonic';

interface Props {
  id?: string;
  size?: number;
  className?: string;
  alt?: string;
}

export function CoverArt({ id, size = 200, className = '', alt = '' }: Props) {
  const [failed, setFailed] = useState(false);

  if (!id || failed) {
    return (
      <div className={`bg-zinc-800 flex items-center justify-center ${className}`}>
        <svg className="w-1/3 h-1/3 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={coverArtUrl(id, size)}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
