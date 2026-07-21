import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patchMyPreferences } from '../api/subsonic';
import { useAuthStore } from '../store/auth';
import { useDownloadsStore, type DownloadTarget } from '../store/downloads';

// Fetch current user preferences via /api/v1/users/me
async function fetchMe() {
  const { useAuthStore: _s } = await import('../store/auth');
  const { token, credentials } = _s.getState();
  if (!credentials) throw new Error('Not authenticated');
  const base = credentials.serverUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}/api/v1/users/me`, { headers });
  if (!res.ok) throw new Error('Failed to load preferences');
  return res.json() as Promise<{
    id: number; username: string; role: string;
    preferences: {
      transcode_format: string | null;
      transcode_bitrate: number | null;
      lastfm_session_key: string | null;
      listenbrainz_token: string | null;
    } | null;
  }>;
}

export function UserSettingsPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>
      <div className="flex gap-1 mb-8 border-b border-zinc-800">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive ? 'border-brand text-brand' : 'border-transparent text-zinc-400 hover:text-white'
            }`
          }
        >
          Account
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink
            to="/settings/admin"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive ? 'border-brand text-brand' : 'border-transparent text-zinc-400 hover:text-white'
              }`
            }
          >
            Admin
          </NavLink>
        )}
      </div>
      <Outlet />
    </div>
  );
}

export function AccountSettingsPanel() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({ queryKey: ['user-me'], queryFn: fetchMe });
  const mut = useMutation({
    mutationFn: patchMyPreferences,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-me'] }),
  });

  const defaultTarget = useDownloadsStore((s) => s.defaultTarget);
  const setDefaultTarget = useDownloadsStore((s) => s.setDefaultTarget);

  const prefs = data?.preferences;
  const [fmt, setFmt] = useState('');
  const [bitrate, setBitrate] = useState('');
  const [lbToken, setLbToken] = useState('');
  const [lfmKey, setLfmKey] = useState('');

  // Initialise from server data on first load
  const [init, setInit] = useState(false);
  if (prefs !== undefined && !init) {
    setFmt(prefs?.transcode_format ?? '');
    setBitrate(prefs?.transcode_bitrate ? String(prefs.transcode_bitrate) : '');
    setLbToken(prefs?.listenbrainz_token ?? '');
    setLfmKey(prefs?.lastfm_session_key ?? '');
    setInit(true);
  }

  if (isLoading) return <div className="text-zinc-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-lg space-y-8">
      <p className="text-sm text-zinc-400 -mt-2">Signed in as {user?.username}</p>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Transcoding</h2>
        <p className="text-xs text-zinc-400 mb-3">
          Set a preferred format/bitrate for mobile data saving. Leave blank to stream originals.
        </p>
        <div className="flex gap-3">
          <select value={fmt} onChange={e => setFmt(e.target.value)} className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
            <option value="">Original format</option>
            <option value="mp3">MP3</option>
            <option value="aac">AAC</option>
            <option value="opus">Opus</option>
            <option value="ogg">OGG Vorbis</option>
          </select>
          <select value={bitrate} onChange={e => setBitrate(e.target.value)} className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
            <option value="">No limit</option>
            <option value="64">64 kbps</option>
            <option value="128">128 kbps</option>
            <option value="192">192 kbps</option>
            <option value="256">256 kbps</option>
            <option value="320">320 kbps</option>
          </select>
        </div>
        <button
          onClick={() => mut.mutate({ transcode_format: fmt || null, transcode_bitrate: bitrate ? Number(bitrate) : null })}
          className="mt-3 bg-brand hover:bg-brand-dim text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Save transcoding
        </button>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Downloads</h2>
        <p className="text-xs text-zinc-400 mb-3">
          Where "Download" sends tracks and playlists by default. This only applies on this device
          — it isn't synced to your account.
        </p>
        <select
          value={defaultTarget}
          onChange={(e) => setDefaultTarget(e.target.value as DownloadTarget)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
        >
          <option value="ask">Always ask</option>
          <option value="app">In Cadence (offline playback)</option>
          <option value="device">This device's Downloads folder</option>
        </select>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">ListenBrainz</h2>
        <p className="text-xs text-zinc-400 mb-3">
          Paste your token from <a href="https://listenbrainz.org/profile/" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">listenbrainz.org/profile</a>.
        </p>
        <input value={lbToken} onChange={e => setLbToken(e.target.value)} placeholder="ListenBrainz user token" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand" />
        <button onClick={() => mut.mutate({ listenbrainz_token: lbToken || null })} className="mt-3 bg-brand hover:bg-brand-dim text-white text-sm px-4 py-2 rounded-lg transition-colors">
          Save ListenBrainz
        </button>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Last.fm</h2>
        <p className="text-xs text-zinc-400 mb-3">
          Paste your Last.fm session key (obtain via Last.fm API auth flow or a tool like <code className="text-zinc-300">lastfm-session-key</code>).
        </p>
        <input value={lfmKey} onChange={e => setLfmKey(e.target.value)} placeholder="Last.fm session key" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand" />
        <button onClick={() => mut.mutate({ lastfm_session_key: lfmKey || null })} className="mt-3 bg-brand hover:bg-brand-dim text-white text-sm px-4 py-2 rounded-lg transition-colors">
          Save Last.fm
        </button>
      </section>

      {mut.isSuccess && <p className="text-green-400 text-sm">Saved.</p>}
      {mut.isError && <p className="text-red-400 text-sm">Save failed.</p>}
    </div>
  );
}
