import { useConnectStore } from '../store/connect';

/**
 * "Playing on <device>" — shown under the track while another device is the one playing, and
 * "<device> is unreachable · Continue here" when that device has gone away (D4 in the design).
 */
export function RemoteLabel({ className = '' }: { className?: string }) {
  const status = useConnectStore((s) => s.status);
  const activeId = useConnectStore((s) => s.activeDeviceId);
  const thisId = useConnectStore((s) => s.deviceId);
  const device = useConnectStore((s) => s.devices.find((d) => d.id === s.activeDeviceId));
  const transferHere = useConnectStore((s) => s.transferHere);

  if (status !== 'online' || activeId === null || activeId === thisId || !device) return null;

  if (device.unreachable) {
    return (
      <p className={`text-[11px] text-amber-400 ${className}`}>
        {device.name} is unreachable ·{' '}
        <button onClick={() => void transferHere()} className="underline hover:text-amber-300">
          Continue here
        </button>
      </p>
    );
  }
  return (
    <p className={`text-[11px] text-brand line-clamp-1 ${className}`}>
      {device.online ? `Playing on ${device.name}` : `${device.name} · reconnecting…`}
    </p>
  );
}
