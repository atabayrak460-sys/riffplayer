import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminGetSettings, adminPatchSettings } from '../../api/subsonic';

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-zinc-800/60">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-zinc-700'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: adminGetSettings });
  const patchMut = useMutation({ mutationFn: adminPatchSettings });

  const [lfmKey, setLfmKey] = useState('');
  const [lfmSecret, setLfmSecret] = useState('');
  const [lfmEnabled, setLfmEnabled] = useState(false);
  const [donationEnabled, setDonationEnabled] = useState(true);

  useEffect(() => {
    if (!settings) return;
    setLfmKey(settings.lastfm_api_key ?? '');
    setLfmSecret(settings.lastfm_api_secret ?? '');
    setLfmEnabled(settings.lastfm_enabled === 'true');
    setDonationEnabled(settings.donation_prompt_enabled !== 'false');
  }, [settings]);

  const save = (patch: Record<string, string | null>) => patchMut.mutate(patch);

  if (isLoading) return <div className="text-zinc-400 text-sm">Loading…</div>;

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Server Settings</h2>

      <section className="mb-8">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Last.fm Scrobbling</h3>
        <Field label="Enable Last.fm" description="Scrobble plays to Last.fm for users who have configured a session key.">
          <Toggle checked={lfmEnabled} onChange={(v) => { setLfmEnabled(v); save({ lastfm_enabled: v ? 'true' : 'false' }); }} />
        </Field>
        <Field label="API Key" description="From last.fm/api/account/create">
          <input value={lfmKey} onChange={e => setLfmKey(e.target.value)} onBlur={() => save({ lastfm_api_key: lfmKey || null })} placeholder="Paste API key" className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white w-64 focus:outline-none focus:border-brand" />
        </Field>
        <Field label="Shared Secret" description="From your Last.fm API account page">
          <input type="password" value={lfmSecret} onChange={e => setLfmSecret(e.target.value)} onBlur={() => save({ lastfm_api_secret: lfmSecret || null })} placeholder="Paste shared secret" className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white w-64 focus:outline-none focus:border-brand" />
        </Field>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Donations</h3>
        <Field label="Show donation link" description="A quiet link in the sidebar. Disabling hides it for all users.">
          <Toggle checked={donationEnabled} onChange={(v) => { setDonationEnabled(v); save({ donation_prompt_enabled: v ? 'true' : 'false' }); }} />
        </Field>
      </section>

      {patchMut.isSuccess && <p className="text-green-400 text-xs mt-4">Saved.</p>}
    </div>
  );
}
