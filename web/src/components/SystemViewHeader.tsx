import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSystemViewSettings, setSystemViewDescription, uploadSystemViewCover, removeSystemViewCover,
  type SystemViewKey,
} from '../api/subsonic';
import { CoverArt } from './CoverArt';

interface Props {
  viewKey: SystemViewKey;
  title: string;
  /** Shown in the description box when no custom description is set. */
  defaultDescription: string;
  /** Stock SVG shown when no custom cover is set. */
  StockCover: ComponentType<{ className?: string }>;
  /** Existing per-page info (track count, etc.), rendered under the title. */
  meta?: ReactNode;
}

export function SystemViewHeader({ viewKey, title, defaultDescription, StockCover, meta }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');

  const settingsKey = ['system-view-settings', viewKey];
  const { data: settings } = useQuery({
    queryKey: settingsKey,
    queryFn: () => getSystemViewSettings(viewKey),
  });

  const coverMutation = useMutation({
    mutationFn: (file: File) => uploadSystemViewCover(viewKey, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey }),
  });
  const removeCoverMutation = useMutation({
    mutationFn: () => removeSystemViewCover(viewKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey }),
  });
  const descriptionMutation = useMutation({
    mutationFn: (description: string) => setSystemViewDescription(viewKey, description),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKey });
      setEditingDescription(false);
    },
  });

  const coverError = coverMutation.isError
    ? coverMutation.error instanceof Error
      ? coverMutation.error.message
      : 'Upload failed'
    : null;

  const hasCover = settings?.hasCover ?? false;
  const description = settings?.description || null;

  return (
    <div className="flex gap-6 mb-6">
      <div className="relative flex-shrink-0 group/cover">
        <CoverArt
          id={hasCover ? `sv-${viewKey}` : undefined}
          size={440}
          className="w-56 h-56 rounded-lg object-cover shadow-xl"
          alt={title}
          fallback={<StockCover className="w-full h-full" />}
        />
        <button
          onClick={() => fileRef.current?.click()}
          title="Upload cover"
          className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        </button>
        {hasCover && (
          <button
            onClick={() => removeCoverMutation.mutate()}
            title="Reset to default cover"
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
            if (f) coverMutation.mutate(f);
            e.target.value = '';
          }}
        />
        {coverError && (
          <p className="absolute top-full mt-1 text-xs text-red-400 w-56">{coverError}</p>
        )}
      </div>

      <div className="flex flex-col flex-1 min-w-0 h-56">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {meta && <div className="text-sm text-zinc-400 mt-1.5">{meta}</div>}

        {editingDescription ? (
          <form
            onSubmit={(e) => { e.preventDefault(); descriptionMutation.mutate(descriptionValue); }}
            className="flex flex-col gap-1.5 mt-3 flex-1 min-h-0"
          >
            <textarea
              autoFocus
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              placeholder={defaultDescription}
              className="bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-brand flex-1 min-h-0"
            />
            <div className="flex gap-2">
              <button type="submit" className="text-brand text-sm">Save</button>
              {description && (
                <button
                  type="button"
                  onClick={() => descriptionMutation.mutate('')}
                  className="text-zinc-500 hover:text-zinc-300 text-sm"
                >
                  Reset to default
                </button>
              )}
              <button type="button" onClick={() => setEditingDescription(false)} className="text-zinc-400 text-sm">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div
            className="mt-3 flex-1 min-h-0 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 overflow-y-auto cursor-pointer hover:border-zinc-700 transition-colors"
            onClick={() => { setDescriptionValue(description ?? ''); setEditingDescription(true); }}
            title="Click to edit description"
          >
            <p className="text-sm text-zinc-400 whitespace-pre-wrap">
              {description || <span className="italic text-zinc-500">{defaultDescription}</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
