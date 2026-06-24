import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/player';
import { CoverArt } from './CoverArt';
import { StarButton } from './StarButton';
import { LyricsPanel } from './LyricsPanel';

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function PlayerBar() {
  const { currentSong, playing, currentTime, duration, volume, togglePlay, next, prev, seek, setVolume } =
    usePlayerStore();

  const seekRef = useRef<HTMLInputElement>(null);
  const [showLyrics, setShowLyrics] = useState(false);

  if (!currentSong) {
    return (
      <footer className="h-20 border-t border-zinc-800 bg-zinc-950 flex items-center justify-center text-zinc-600 text-sm">
        No track playing
      </footer>
    );
  }

  return (
    <>
      {showLyrics && <LyricsPanel onClose={() => setShowLyrics(false)} />}
    <footer className="h-20 border-t border-zinc-800 bg-zinc-950 flex items-center px-4 gap-4 relative z-20">
      {/* Left: now playing info */}
      <div className="flex items-center gap-3 w-64 min-w-0 flex-shrink-0">
        <CoverArt
          id={currentSong.coverArt}
          size={56}
          className="w-14 h-14 rounded flex-shrink-0"
          alt={currentSong.title}
        />
        <div className="min-w-0">
          <Link
            to={`/albums/${currentSong.albumId}`}
            className="text-sm font-medium text-white hover:text-brand transition-colors line-clamp-1 block"
          >
            {currentSong.title}
          </Link>
          <Link
            to={`/artists/${currentSong.artistId}`}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors line-clamp-1 block"
          >
            {currentSong.artist}
          </Link>
        </div>
        <StarButton starred={!!currentSong.starred} opts={{ id: currentSong.id }} />
      </div>

      {/* Center: controls + seek */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-xl mx-auto">
        <div className="flex items-center gap-6">
          <button onClick={prev} title="Previous" className="text-zinc-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>

          <button
            onClick={togglePlay}
            title={playing ? 'Pause' : 'Play'}
            className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"
          >
            {playing ? (
              <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            )}
          </button>

          <button onClick={next} title="Next" className="text-zinc-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8z M16 6h2v12h-2z" />
            </svg>
          </button>
        </div>

        {/* Seek bar */}
        <div className="w-full flex items-center gap-2">
          <span className="text-xs text-zinc-400 w-8 text-right tabular-nums">{formatTime(currentTime)}</span>
          <input
            ref={seekRef}
            type="range"
            min={0}
            max={duration || 0}
            step={0.5}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 h-1 accent-brand cursor-pointer"
          />
          <span className="text-xs text-zinc-400 w-8 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: volume + queue link */}
      <div className="flex items-center gap-3 w-48 justify-end flex-shrink-0">
        <button
          onClick={() => setShowLyrics((v) => !v)}
          title="Lyrics"
          className={`transition-colors ${showLyrics ? 'text-brand' : 'text-zinc-400 hover:text-white'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </button>
        <Link to="/queue" title="Queue" className="text-zinc-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
          </svg>
        </Link>
        <svg className="w-4 h-4 text-zinc-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-20 h-1 accent-brand cursor-pointer"
        />
      </div>
    </footer>
    </>
  );
}
