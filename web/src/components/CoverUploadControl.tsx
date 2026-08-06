import { useRef, type ReactNode } from 'react';
import { CoverArt } from './CoverArt';

interface Props {
  coverId?: string;
  coverSize: number;
  /** Full className for the CoverArt element itself (size/shape/shadow/etc.) — callers keep control since it varies (circle avatar vs. rounded-square cover). */
  coverClassName: string;
  alt: string;
  fallback?: ReactNode;
  /** Only affects the hover-overlay's corner rounding, to match the cover's own shape. */
  shape: 'square' | 'circle';
  /** Hides the upload/remove/error controls entirely (the cover art itself still renders) — e.g. non-admins viewing an artist page. Defaults to true. */
  visible?: boolean;
  hasCover: boolean;
  uploadTitle: string;
  removeTitle: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
  error?: string | null;
}

/**
 * Hover-overlay upload button + hidden file input + remove/reset button +
 * error message, shared by every place in the app that lets a user replace
 * an image (system-view covers, artist photos, playlist covers). Previously
 * reimplemented independently in three places, with the playlist case
 * missing a remove button entirely.
 */
export function CoverUploadControl({
  coverId, coverSize, coverClassName, alt, fallback, shape, visible = true,
  hasCover, uploadTitle, removeTitle, onUpload, onRemove, error,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const overlayRounded = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

  return (
    <div className={`relative flex-shrink-0 ${visible ? 'group/cover' : ''}`}>
      <CoverArt id={coverId} size={coverSize} className={coverClassName} alt={alt} fallback={fallback} />
      {visible && (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            title={uploadTitle}
            className={`absolute inset-0 bg-black/60 ${overlayRounded} flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity`}
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          </button>
          {hasCover && (
            <button
              onClick={onRemove}
              title={removeTitle}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-zinc-900/90 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 opacity-0 group-hover/cover:opacity-100 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
          {error && <p className="absolute top-full mt-1 text-xs text-red-400 w-full">{error}</p>}
        </>
      )}
    </div>
  );
}
