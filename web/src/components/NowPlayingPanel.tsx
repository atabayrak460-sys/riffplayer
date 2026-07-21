import { usePlayerStore } from '../store/player';
import { HeroSection } from './nowplaying/HeroSection';
import { AlbumTracksSection } from './nowplaying/AlbumTracksSection';
import { ArtistTracksSection } from './nowplaying/ArtistTracksSection';
import { UpNextSection } from './nowplaying/UpNextSection';

/** Right-side panel mirroring the sidebar's fixed-width/flex-shrink-0 behavior;
 *  hidden below the xl breakpoint (collapses on narrow screens), and only
 *  rendered at all while something is playing. */
export function NowPlayingPanel() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  if (!currentSong) return null;

  return (
    <aside className="hidden xl:flex w-80 flex-shrink-0 flex-col bg-zinc-950 border-l border-zinc-800 overflow-y-auto">
      <HeroSection song={currentSong} />
      <AlbumTracksSection song={currentSong} />
      <ArtistTracksSection song={currentSong} />
      <UpNextSection />
    </aside>
  );
}
