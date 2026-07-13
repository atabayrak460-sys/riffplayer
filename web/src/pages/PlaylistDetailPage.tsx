import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getPlaylist, renamePlaylist, setPlaylistDescription, deletePlaylist,
  reorderPlaylistTracks, uploadPlaylistCover,
} from '../api/subsonic';
import { usePlayerStore } from '../store/player';
import { CoverArt } from '../components/CoverArt';
import { SongRow } from '../components/SongRow';
import type { Song } from '../api/types';

function DraggableSongRow({ song, index, songs }: { song: Song; index: number; songs: Song[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.id + '-' + index,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center group"
    >
      <button
        {...attributes}
        {...listeners}
        className="px-2 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 4a1 1 0 0 1 2 0v16a1 1 0 0 1-2 0V4zm4 0a1 1 0 0 1 2 0v16a1 1 0 0 1-2 0V4z" />
        </svg>
      </button>
      <div className="flex-1 min-w-0">
        <SongRow song={song} queue={songs} index={index + 1} showAlbum />
      </div>
    </div>
  );
}

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { playQueue } = usePlayerStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');

  const { data: playlist, isLoading } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => getPlaylist(id!),
    enabled: !!id,
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => renamePlaylist(id!, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlist', id] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setEditingName(false);
    },
  });

  const descriptionMutation = useMutation({
    mutationFn: (comment: string) => setPlaylistDescription(id!, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlist', id] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setEditingDescription(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePlaylist(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlists'] });
      navigate('/playlists');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (trackIds: string[]) => reorderPlaylistTracks(id!, trackIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlist', id] }),
  });

  const coverMutation = useMutation({
    mutationFn: (file: File) => uploadPlaylistCover(id!, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlist', id] }),
  });
  const coverError = coverMutation.isError
    ? coverMutation.error instanceof Error
      ? coverMutation.error.message
      : 'Upload failed'
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading) {
    return <div className="p-6 text-zinc-400 text-sm">Loading…</div>;
  }
  if (!playlist) {
    return <div className="p-6 text-red-400 text-sm">Playlist not found.</div>;
  }

  const songs = playlist.entry ?? [];
  const songIds = songs.map((s, i) => s.id + '-' + i);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = songIds.indexOf(String(active.id));
    const to = songIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const reordered = [...songs];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderMutation.mutate(reordered.map((s) => s.id));
  };

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex gap-5 mb-8">
        <div className="relative flex-shrink-0 group/cover">
          <CoverArt
            id={playlist.coverArt}
            size={160}
            className="w-36 h-36 rounded-lg object-cover shadow-xl"
            alt={playlist.name}
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
            <p className="absolute top-full mt-1 text-xs text-red-400 w-36">{coverError}</p>
          )}
        </div>

        <div className="flex flex-col justify-end gap-2">
          <p className="text-xs uppercase tracking-widest text-zinc-400">Playlist</p>
          {editingName ? (
            <form
              onSubmit={(e) => { e.preventDefault(); renameMutation.mutate(nameValue); }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white text-xl font-bold focus:outline-none focus:border-brand"
              />
              <button type="submit" className="text-brand text-sm">Save</button>
              <button type="button" onClick={() => setEditingName(false)} className="text-zinc-400 text-sm">Cancel</button>
            </form>
          ) : (
            <h1
              className="text-3xl font-bold text-white cursor-pointer hover:text-brand transition-colors"
              onClick={() => { setNameValue(playlist.name); setEditingName(true); }}
              title="Click to rename"
            >
              {playlist.name}
            </h1>
          )}
          <p className="text-sm text-zinc-400">{songs.length} tracks</p>

          {editingDescription ? (
            <form
              onSubmit={(e) => { e.preventDefault(); descriptionMutation.mutate(descriptionValue); }}
              className="flex flex-col gap-1.5 max-w-md"
            >
              <textarea
                autoFocus
                rows={2}
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                placeholder="Add a description…"
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white text-sm resize-none focus:outline-none focus:border-brand"
              />
              <div className="flex gap-2">
                <button type="submit" className="text-brand text-sm">Save</button>
                <button type="button" onClick={() => setEditingDescription(false)} className="text-zinc-400 text-sm">Cancel</button>
              </div>
            </form>
          ) : (
            <p
              className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer max-w-md"
              onClick={() => { setDescriptionValue(playlist.comment ?? ''); setEditingDescription(true); }}
              title="Click to edit description"
            >
              {playlist.comment || <span className="italic text-zinc-600">Add a description…</span>}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={() => playQueue(songs)}
              disabled={!songs.length}
              className="bg-brand hover:bg-brand-dim text-white text-sm font-medium px-5 py-2 rounded-full transition-colors disabled:opacity-50"
            >
              Play
            </button>
            <button
              onClick={() => { if (confirm(`Delete "${playlist.name}"?`)) deleteMutation.mutate(); }}
              className="text-zinc-400 hover:text-red-400 transition-colors text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Draggable track list */}
      {songs.length === 0 ? (
        <p className="text-zinc-400 text-sm">No tracks yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={songIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {songs.map((song, i) => (
                <DraggableSongRow key={song.id + '-' + i} song={song} index={i} songs={songs} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
