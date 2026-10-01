import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../store/player';
import { useDownloadsStore } from '../store/downloads';
import { CoverArt } from './CoverArt';
import { StarButton } from './StarButton';
import { LyricsPanel } from './LyricsPanel';
import { ContextMenu, useContextMenu, type ContextMenuItem } from './ContextMenu';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { SongInfoDialog } from './SongInfoDialog';

// Same paths as SongRow.tsx's ICONS — kept local since the two components
// don't share a parent that would make a common import obviously cheaper.
const ICONS = {
  playNext: 'M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.348a1.875 1.875 0 0 1 0 3.284l-11.54 6.347c-1.25.688-2.779-.215-2.779-1.643V5.653Z',
  queue: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  playlist: 'M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  download: 'M12 3v13.5m0 0-4.5-4.5m4.5 4.5 4.5-4.5M4.5 19.5h15',
  trash: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
  album: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z',
  artist: 'M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z',
  info: 'M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
  more: 'M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z',
};

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function PlayerBar() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const playing = usePlayerStore((s) => s.playing);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const playNext = usePlayerStore((s) => s.playNext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);

  const navigate = useNavigate();
  const downloadState = useDownloadsStore((s) => s.trackState(currentSong?.id ?? ''));
  const requestDownload = useDownloadsStore((s) => s.requestDownload);
  const removeTrackDownload = useDownloadsStore((s) => s.removeTrackDownload);
  const { menu, openAt, close } = useContextMenu();

  const seekRef = useRef<HTMLInputElement>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Mobile only (#22): the compact bar expands into this sheet for the
  // full transport controls, rather than trying to cram the desktop bar's
  // 3 fixed-width columns into a phone-width footer.
  const [mobileExpanded, setMobileExpanded] = useState(false);

  if (!currentSong) {
    return (
      <footer className="h-20 border-t border-zinc-800 bg-zinc-950 flex items-center justify-center text-zinc-600 text-sm">
        No track playing
      </footer>
    );
  }

  const menuItems: ContextMenuItem[] = [
    { label: 'Play next', icon: ICONS.playNext, onClick: () => playNext(currentSong) },
    { label: 'Add to queue', icon: ICONS.queue, onClick: () => addToQueue(currentSong) },
    { label: 'Add to playlist', icon: ICONS.playlist, onClick: () => setShowAddToPlaylist(true) },
    downloadState === 'downloaded'
      ? { label: 'Remove download', icon: ICONS.trash, onClick: () => removeTrackDownload(currentSong.id), danger: true }
      : { label: 'Download', icon: ICONS.download, onClick: () => requestDownload({ kind: 'track', song: currentSong }) },
    { label: 'Go to album', icon: ICONS.album, onClick: () => navigate(`/albums/${currentSong.albumId}`) },
    { label: 'Go to artist', icon: ICONS.artist, onClick: () => navigate(`/artists/${currentSong.artistId}`) },
    { label: 'Song info', icon: ICONS.info, onClick: () => setShowInfo(true) },
  ];

  const moreOptionsButton = (
    <button
      onClick={(e) => openAt(e, menuItems)}
      title="More options"
      className="text-zinc-400 hover:text-white transition-colors flex-shrink-0"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d={ICONS.more} />
      </svg>
    </button>
  );

  const transportControls = (
    <div className="flex items-center gap-6">
      <button
        onClick={toggleShuffle}
        title="Shuffle"
        className={`transition-colors ${shuffle ? 'text-brand' : 'text-zinc-400 hover:text-white'}`}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
        </svg>
      </button>

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

      <button
        onClick={toggleRepeat}
        title={`Repeat: ${repeatMode}`}
        className={`relative transition-colors ${
          repeatMode !== 'off' ? 'text-brand' : 'text-zinc-400 hover:text-white'
        }`}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v3z" />
        </svg>
        {repeatMode === 'one' && (
          <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-brand text-black text-[8px] font-bold leading-none flex items-center justify-center">
            1
          </span>
        )}
      </button>
    </div>
  );

  const seekBar = (
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
  );

  return (
    <>
      {showLyrics && <LyricsPanel onClose={() => setShowLyrics(false)} />}
      <ContextMenu menu={menu} onClose={close} />
      {showAddToPlaylist && (
        <AddToPlaylistDialog songId={currentSong.id} onClose={() => setShowAddToPlaylist(false)} />
      )}
      {showInfo && <SongInfoDialog song={currentSong} onClose={() => setShowInfo(false)} />}

      {/* Desktop bar — unchanged from before #22, just now gated to md+ */}
      <footer className="hidden md:flex h-20 border-t border-zinc-800 bg-zinc-950 items-center px-4 gap-4 relative z-20">
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
          {moreOptionsButton}
        </div>

        {/* Center: controls + seek */}
        <div className="flex-1 flex flex-col items-center gap-1 max-w-xl mx-auto">
          {transportControls}
          {seekBar}
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

      {/* Mobile compact bar (#22) — tap the song info to expand full controls below */}
      <footer data-testid="mobile-compact-bar" className="md:hidden border-t border-zinc-800 bg-zinc-950 relative z-20">
        <div className="flex items-center gap-3 px-3 py-2">
          <button
            onClick={() => setMobileExpanded(true)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            <CoverArt
              id={currentSong.coverArt}
              size={40}
              className="w-10 h-10 rounded flex-shrink-0"
              alt={currentSong.title}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{currentSong.title}</p>
              <p className="text-xs text-zinc-400 truncate">{currentSong.artist}</p>
            </div>
          </button>
          <button onClick={togglePlay} title={playing ? 'Pause' : 'Play'} className="flex-shrink-0 p-1">
            {playing ? (
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            )}
          </button>
          <button onClick={next} title="Next" className="flex-shrink-0 p-1 text-zinc-300">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8z M16 6h2v12h-2z" />
            </svg>
          </button>
        </div>
        <div className="h-0.5 bg-zinc-800">
          <div
            className="h-full bg-brand"
            style={{ width: duration > 0 ? `${Math.min(100, (currentTime / duration) * 100)}%` : '0%' }}
          />
        </div>
      </footer>

      {/* Mobile expanded sheet (#22) — full controls; no volume slider, mobile
          relies on hardware volume keys (same call as #69's mobile decision). */}
      {mobileExpanded && (
        <div
          data-testid="mobile-expanded-sheet"
          className="md:hidden fixed inset-0 bg-black/60 z-50"
          onClick={() => setMobileExpanded(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
          >
            <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-3 mb-4">
              <CoverArt
                id={currentSong.coverArt}
                size={56}
                className="w-14 h-14 rounded flex-shrink-0"
                alt={currentSong.title}
              />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/albums/${currentSong.albumId}`}
                  onClick={() => setMobileExpanded(false)}
                  className="text-sm font-medium text-white line-clamp-1 block"
                >
                  {currentSong.title}
                </Link>
                <Link
                  to={`/artists/${currentSong.artistId}`}
                  onClick={() => setMobileExpanded(false)}
                  className="text-xs text-zinc-400 line-clamp-1 block"
                >
                  {currentSong.artist}
                </Link>
              </div>
              <StarButton starred={!!currentSong.starred} opts={{ id: currentSong.id }} />
              {moreOptionsButton}
            </div>

            {seekBar}
            <div className="flex justify-center mt-3 mb-1">{transportControls}</div>

            <div className="flex items-center justify-center gap-8 mt-3 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowLyrics((v) => !v)}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  showLyrics ? 'text-brand' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                Lyrics
              </button>
              <Link
                to="/queue"
                onClick={() => setMobileExpanded(false)}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
                </svg>
                Queue
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
