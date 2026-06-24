import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLyrics } from '../api/subsonic';
import { usePlayerStore } from '../store/player';

interface Props {
  onClose: () => void;
}

export function LyricsPanel({ onClose }: Props) {
  const { currentSong, currentTime } = usePlayerStore();
  const activeLyricRef = useRef<HTMLParagraphElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: lyrics, isLoading, isError } = useQuery({
    queryKey: ['lyrics', currentSong?.id],
    queryFn: () => (currentSong ? getLyrics(currentSong.id) : null),
    enabled: !!currentSong,
  });

  // Find the active lyric line
  const lines = lyrics?.line ?? [];
  let activeIdx = -1;
  if (lyrics?.synced) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].start <= currentTime * 1000) activeIdx = i;
      else break;
    }
  }

  // Auto-scroll to active line
  useEffect(() => {
    if (autoScroll && activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIdx, autoScroll]);

  return (
    <div className="fixed inset-x-0 bottom-20 top-0 z-10 flex items-end justify-center pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-lg h-full bg-zinc-950/95 backdrop-blur-md flex flex-col shadow-2xl border-l border-zinc-800"
        onWheel={() => setAutoScroll(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-white">{currentSong?.title ?? 'Lyrics'}</p>
            <p className="text-xs text-zinc-400">{currentSong?.artist}</p>
          </div>
          <div className="flex items-center gap-3">
            {!autoScroll && (
              <button
                onClick={() => setAutoScroll(true)}
                className="text-xs text-brand hover:underline"
              >
                Auto-scroll
              </button>
            )}
            <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Lyrics body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-3">
          {!currentSong && (
            <p className="text-zinc-500 text-center text-sm">Nothing playing.</p>
          )}
          {currentSong && isLoading && (
            <p className="text-zinc-500 text-center text-sm">Loading lyrics…</p>
          )}
          {currentSong && isError && (
            <p className="text-zinc-500 text-center text-sm">Lyrics unavailable.</p>
          )}
          {currentSong && !isLoading && !isError && !lyrics && (
            <p className="text-zinc-500 text-center text-sm">No lyrics found for this track.</p>
          )}
          {lyrics &&
            lines.map((line, i) => {
              const isActive = i === activeIdx;
              return (
                <p
                  key={i}
                  ref={isActive ? activeLyricRef : null}
                  className={`text-lg leading-relaxed transition-all duration-300 ${
                    isActive
                      ? 'text-white font-semibold scale-105 origin-left'
                      : 'text-zinc-500'
                  }`}
                >
                  {line.value || ' '}
                </p>
              );
            })}
        </div>
      </div>
    </div>
  );
}
