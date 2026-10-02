import { useRef } from 'react';
import { usePlayerStore } from '../store/player';
import { usePanelSizesStore, NOW_PLAYING_MIN, NOW_PLAYING_MAX } from '../store/panelSizes';
import { ResizeHandle } from './ResizeHandle';
import { HeroSection } from './nowplaying/HeroSection';
import { AlbumTracksSection } from './nowplaying/AlbumTracksSection';
import { ArtistTracksSection } from './nowplaying/ArtistTracksSection';
import { UpNextSection } from './nowplaying/UpNextSection';

/** Right-side panel mirroring the sidebar's resizable/flex-shrink-0 behavior;
 *  hidden below the xl breakpoint (collapses on narrow screens), and only
 *  rendered at all while something is playing. */
export function NowPlayingPanel() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const width = usePanelSizesStore((s) => s.nowPlayingWidth);
  const setWidth = usePanelSizesStore((s) => s.setNowPlayingWidth);
  const asideRef = useRef<HTMLElement>(null);
  if (!currentSong) return null;

  return (
    <div className="hidden xl:flex flex-shrink-0">
      {/* Handle sits on the panel's left edge, so dragging left grows it. */}
      <ResizeHandle
        targetRef={asideRef} width={width} min={NOW_PLAYING_MIN} max={NOW_PLAYING_MAX}
        direction={-1} onCommit={setWidth}
      />
      <aside
        ref={asideRef}
        style={{ width }}
        className="flex-shrink-0 flex flex-col bg-zinc-950 border-l border-zinc-800 overflow-y-auto"
      >
        <HeroSection song={currentSong} />
        <AlbumTracksSection song={currentSong} />
        <ArtistTracksSection song={currentSong} />
        <UpNextSection />
      </aside>
    </div>
  );
}
