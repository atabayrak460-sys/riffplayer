import { useQuery } from '@tanstack/react-query';
import { getArtist, getAlbum } from '../api/subsonic';

/**
 * All of an artist's songs across every album, aggregated client-side from
 * the same per-album fetches "Play all" already uses — shared by the artist
 * page's Songs tab and the Now Playing panel's "More from this artist"
 * section via identical query keys, so whichever loads first caches it for
 * the other.
 */
export function useArtistSongs(artistId: string | undefined, enabled = true) {
  const { data: artist } = useQuery({
    queryKey: ['artist', artistId],
    queryFn: () => getArtist(artistId!),
    enabled: !!artistId,
  });

  const albums = artist?.album ?? [];

  const { data: songs = [], isLoading } = useQuery({
    queryKey: ['artist-songs', artistId],
    queryFn: async () => {
      const all = (
        await Promise.all(albums.map((a) => getAlbum(a.id).then((r) => r.song ?? [])))
      ).flat();
      return all.sort((a, b) => a.title.localeCompare(b.title));
    },
    enabled: !!artistId && enabled && albums.length > 0,
  });

  return { artist, songs, isLoading };
}
