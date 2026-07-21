import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getArtist } from '../../api/subsonic';
import { CoverArt } from '../CoverArt';
import type { Song } from '../../api/types';

export function HeroSection({ song }: { song: Song }) {
  // Same query key ArtistDetailPage uses for this artist — shares its cache.
  const { data: artist } = useQuery({
    queryKey: ['artist', song.artistId],
    queryFn: () => getArtist(song.artistId),
  });

  return (
    <div className="p-4">
      <div className="relative aspect-square mb-4">
        <Link to={`/albums/${song.albumId}`}>
          <CoverArt
            id={song.coverArt}
            size={400}
            className="w-full h-full object-cover rounded-lg shadow-xl"
            alt={song.album}
          />
        </Link>
        {artist?.coverArt && (
          <Link
            to={`/artists/${song.artistId}`}
            title={artist.name}
            className="absolute bottom-2 right-2 w-12 h-12 rounded-full ring-2 ring-zinc-950 overflow-hidden shadow-lg hover:scale-105 transition-transform"
          >
            <CoverArt id={artist.coverArt} size={96} className="w-full h-full object-cover" alt={artist.name} />
          </Link>
        )}
      </div>

      <p className="text-lg font-bold text-white truncate">{song.title}</p>
      <Link
        to={`/artists/${song.artistId}`}
        className="text-sm text-zinc-400 hover:text-white transition-colors truncate block"
      >
        {song.artist}
      </Link>
      <Link
        to={`/albums/${song.albumId}`}
        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors truncate block"
      >
        {song.album}
      </Link>
    </div>
  );
}
