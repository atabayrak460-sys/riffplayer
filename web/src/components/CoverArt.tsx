import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { coverArtUrl } from '../api/subsonic';
import { getCoverBlob } from '../lib/offlineDb';

interface Props {
  id?: string;
  size?: number;
  className?: string;
  alt?: string;
  /** Rendered instead of the generic placeholder icon when there's no real cover. */
  fallback?: ReactNode;
}

export function CoverArt({ id, size = 200, className = '', alt = '', fallback }: Props) {
  // 'network' tries the live server first (unchanged default behavior); on
  // failure (offline, 404, etc.) we fall back to a locally downloaded cover
  // before giving up on 'placeholder' — this is what keeps downloaded tracks'
  // artwork visible with no internet.
  const [state, setState] = useState<'network' | 'offline' | 'placeholder'>('network');
  const [offlineUrl, setOfflineUrl] = useState<string | null>(null);

  useEffect(() => {
    setState('network');
    setOfflineUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [id]);

  useEffect(() => {
    return () => {
      if (offlineUrl) URL.revokeObjectURL(offlineUrl);
    };
  }, [offlineUrl]);

  const handleError = () => {
    if (state === 'offline' || !id) {
      setState('placeholder');
      return;
    }
    getCoverBlob(id).then((blob) => {
      if (blob) {
        setOfflineUrl(URL.createObjectURL(blob));
        setState('offline');
      } else {
        setState('placeholder');
      }
    });
  };

  // Memoized so unrelated re-renders (e.g. a sibling query settling) don't
  // regenerate the Subsonic auth salt and swap <img src>, which aborts the
  // in-flight request and can spuriously trip onError into the placeholder.
  const networkUrl = useMemo(() => (id ? coverArtUrl(id, size) : null), [id, size]);

  if (!id || state === 'placeholder') {
    if (fallback) return <div className={`overflow-hidden ${className}`}>{fallback}</div>;
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
      src={state === 'offline' && offlineUrl ? offlineUrl : networkUrl!}
      alt={alt}
      className={className}
      onError={handleError}
      loading="lazy"
    />
  );
}
