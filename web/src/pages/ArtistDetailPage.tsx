import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getArtist, getAlbum, uploadArtistCover, removeArtistCover } from '../api/subsonic';
import { usePlayerStore } from '../store/player';
import { useAuthStore } from '../store/auth';
import { CoverArt } from '../components/CoverArt';
import { AlbumCard } from '../components/AlbumCard';
import { StarButton } from '../components/StarButton';

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { playQueue } = usePlayerStore();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => getArtist(id!),
    enabled: !!id,
  });

  const coverMutation = useMutation({
    mutationFn: (file: File) => uploadArtistCover(id!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artist', id] });
      qc.invalidateQueries({ queryKey: ['artists'] });
    },
  });
  const removeCoverMutation = useMutation({
    mutationFn: () => removeArtistCover(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artist', id] });
      qc.invalidateQueries({ queryKey: ['artists'] });
    },
  });
  const coverError = coverMutation.isError
    ? coverMutation.error instanceof Error
      ? coverMutation.error.message
      : 'Upload failed'
    : null;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 bg-zinc-800 rounded animate-pulse w-48 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square bg-zinc-800 rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !artist) {
    return <div className="p-6 text-red-400 text-sm">Artist not found.</div>;
  }

  const albums = artist.album ?? [];

  const playAll = async () => {
    const allSongs = (
      await Promise.all(albums.map((a) => getAlbum(a.id).then((r) => r.song ?? [])))
    ).flat();
    if (allSongs.length) playQueue(allSongs);
  };

  return (
    <div className="p-6">
      <div className="flex items-end gap-5 mb-8">
        <div className={`relative flex-shrink-0 ${isAdmin ? 'group/cover' : ''}`}>
          <CoverArt
            id={artist.coverArt}
            size={160}
            className="w-32 h-32 rounded-full object-cover shadow-xl"
            alt={artist.name}
          />
          {isAdmin && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                title="Upload photo"
                className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </button>
              {artist.coverArt && (
                <button
                  onClick={() => removeCoverMutation.mutate()}
                  title="Remove photo"
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 opacity-0 group-hover/cover:opacity-100 transition-opacity"
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
                <p className="absolute top-full mt-1 text-xs text-red-400 w-32">{coverError}</p>
              )}
            </>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400">Artist</p>
          <h1 className="text-3xl font-bold text-white mt-1">{artist.name}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={playAll}
              className="bg-brand hover:bg-brand-dim text-white text-sm font-medium px-5 py-2 rounded-full transition-colors"
            >
              Play all
            </button>
            <StarButton starred={!!artist.starred} opts={{ artistId: artist.id }} />
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest mb-4">Albums</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </div>
    </div>
  );
}
