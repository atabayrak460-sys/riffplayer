// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemoteLabel } from './RemoteLabel';
import { useConnectStore } from '../store/connect';
import type { DeviceInfo } from '../api/connect';

const ME = 'me-device-0001';
const PHONE = 'phone-device-01';
const device = (id: string, over: Partial<DeviceInfo> = {}): DeviceInfo =>
  ({ id, name: id === ME ? 'My PC' : 'Pixel', type: 'web', online: true, unreachable: false, active: false, ...over });

const transferHere = vi.fn();

function setup(over: Partial<ReturnType<typeof useConnectStore.getState>> = {}) {
  useConnectStore.setState({
    status: 'online', deviceId: ME, activeDeviceId: PHONE, transferHere,
    devices: [device(ME), device(PHONE, { active: true })], ...over,
  });
  return render(<RemoteLabel />);
}

beforeEach(() => transferHere.mockReset());

describe('RemoteLabel', () => {
  it('says which device is playing while it is another one', () => {
    setup();
    expect(screen.getByText('Playing on Pixel')).toBeInTheDocument();
  });

  it.each([
    ['this device is the one playing', { activeDeviceId: ME }],
    ['nothing is playing', { activeDeviceId: null }],
    ['the connection is down', { status: 'offline' as const }],
    ['the active device is not in the list', { devices: [device(ME)] }],
  ])('shows nothing when %s', (_label, over) => {
    const { container } = setup(over);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "reconnecting" for an active device that just dropped out', () => {
    setup({ devices: [device(ME), device(PHONE, { active: true, online: false })] });
    expect(screen.getByText('Pixel · reconnecting…')).toBeInTheDocument();
  });

  it('offers "Continue here" once the active device is unreachable, and it brings playback to this device', async () => {
    setup({ devices: [device(ME), device(PHONE, { active: true, online: false, unreachable: true })] });
    expect(screen.getByText(/Pixel is unreachable/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue here' }));

    expect(transferHere).toHaveBeenCalledTimes(1);
  });

  it('does not offer "Continue here" while the device is merely reconnecting', () => {
    setup({ devices: [device(ME), device(PHONE, { active: true, online: false })] });
    expect(screen.queryByRole('button', { name: 'Continue here' })).not.toBeInTheDocument();
  });
});
