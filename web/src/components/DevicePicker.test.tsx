// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevicePicker } from './DevicePicker';
import { useConnectStore } from '../store/connect';
import type { DeviceInfo } from '../api/connect';

const ME = 'me-device-0001';
const device = (id: string, over: Partial<DeviceInfo> = {}): DeviceInfo =>
  ({ id, name: id, type: 'web', online: true, unreachable: false, active: false, ...over });

const transferTo = vi.fn();

function setup(over: Partial<ReturnType<typeof useConnectStore.getState>> = {}) {
  useConnectStore.setState({
    status: 'online', deviceId: ME, devices: [], activeDeviceId: null, transferTo, ...over,
  });
  return render(<DevicePicker />);
}

const open = () => userEvent.click(screen.getByRole('button', { name: 'Connect to a device' }));
const items = () => screen.getAllByRole('menuitem');

beforeEach(() => {
  transferTo.mockReset();
});

describe('DevicePicker', () => {
  it.each(['idle', 'unavailable'] as const)('renders nothing while the connection is "%s"', (status) => {
    const { container } = setup({ status });
    expect(container).toBeEmptyDOMElement();
  });

  it('is closed until the speaker button is clicked, and toggles', async () => {
    setup({ devices: [device(ME)] });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await open();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await open();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('lists this device first, then the playing one, then others, then the ones that are gone', async () => {
    setup({
      activeDeviceId: 'b-phone-000001',
      devices: [
        device('d-gone-000001', { name: 'Old tablet', online: false, unreachable: true }),
        device('c-laptop-00001', { name: 'Laptop' }),
        device('b-phone-000001', { name: 'Phone', type: 'android', active: true }),
        device(ME, { name: 'My PC' }),
      ],
    });
    await open();

    expect(items().map((i) => within(i).getAllByText(/./)[0].textContent)).toEqual(['My PC', 'Phone', 'Laptop', 'Old tablet']);
  });

  it('labels each device: type, "This device", "Playing", reconnecting and unreachable', async () => {
    setup({
      activeDeviceId: 'b-phone-000001',
      devices: [
        device(ME, { name: 'My PC' }),
        device('b-phone-000001', { name: 'Phone', type: 'android', active: true }),
        device('c-gone-0000001', { name: 'Blip', online: false }),
        device('d-gone-0000001', { name: 'Lost', online: false, unreachable: true }),
        device('e-desktop-0001', { name: 'Desk', type: 'desktop' }),
      ],
    });
    await open();

    expect(screen.getByText('Web · This device')).toBeInTheDocument();
    expect(screen.getByText('Android · Playing')).toBeInTheDocument();
    expect(screen.getByText('Web · Reconnecting…')).toBeInTheDocument();
    expect(screen.getByText('Web · Unreachable')).toBeInTheDocument();
    expect(screen.getByText('Desktop')).toBeInTheDocument();
  });

  it('marks the playing device as the current item', async () => {
    setup({ activeDeviceId: 'b-phone-000001', devices: [device(ME), device('b-phone-000001', { name: 'Phone', active: true })] });
    await open();

    expect(screen.getByRole('menuitem', { name: /Phone/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('menuitem', { name: new RegExp(ME) })).not.toHaveAttribute('aria-current');
  });

  it('choosing another online device hands playback to it and closes the menu', async () => {
    setup({ devices: [device(ME), device('b-phone-000001', { name: 'Phone' })] });
    await open();

    await userEvent.click(screen.getByRole('menuitem', { name: /Phone/ }));

    expect(transferTo).toHaveBeenCalledWith('b-phone-000001');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers "Play here" on this device while another one is playing, and choosing it brings playback over', async () => {
    setup({ activeDeviceId: 'b-phone-000001', devices: [device(ME, { name: 'My PC' }), device('b-phone-000001', { name: 'Phone', active: true })] });
    await open();
    expect(screen.getByText('Play here')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('menuitem', { name: /My PC/ }));

    expect(transferTo).toHaveBeenCalledWith(ME);
  });

  it('does not offer "Play here" when this device is the one playing', async () => {
    setup({ activeDeviceId: ME, devices: [device(ME, { active: true })] });
    await open();
    expect(screen.queryByText('Play here')).not.toBeInTheDocument();
  });

  it('choosing the device that is already playing does nothing', async () => {
    setup({ activeDeviceId: 'b-phone-000001', devices: [device(ME), device('b-phone-000001', { name: 'Phone', active: true })] });
    await open();

    await userEvent.click(screen.getByRole('menuitem', { name: /Phone/ }));

    expect(transferTo).not.toHaveBeenCalled();
  });

  it('a device that is offline cannot be chosen', async () => {
    setup({ devices: [device(ME), device('d-gone-0000001', { name: 'Lost', online: false, unreachable: true })] });
    await open();

    const lost = screen.getByRole('menuitem', { name: /Lost/ });
    expect(lost).toBeDisabled();
    await userEvent.click(lost);
    expect(transferTo).not.toHaveBeenCalled();
  });

  it('suggests opening RiffPlayer elsewhere when this is the only device', async () => {
    setup({ devices: [device(ME)] });
    await open();
    expect(screen.getByText(/open riffplayer on another device/i)).toBeInTheDocument();
  });

  it('tells the user when the connection is down or still being made', async () => {
    const { unmount } = setup({ status: 'offline', devices: [device(ME)] });
    await open();
    expect(screen.getByText('Not connected — trying again')).toBeInTheDocument();
    expect(screen.queryByText(/open riffplayer on another device/i)).not.toBeInTheDocument();
    unmount();

    setup({ status: 'connecting', devices: [] });
    await open();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('highlights the speaker button while another device is the one playing', () => {
    setup({ activeDeviceId: 'b-phone-000001', devices: [device(ME), device('b-phone-000001', { active: true })] });
    expect(screen.getByRole('button', { name: 'Connect to a device' })).toHaveClass('text-brand');
  });

  it('closes on Escape and on a click outside, but not on a click inside', async () => {
    setup({ devices: [device(ME)] });
    await open();
    await userEvent.click(screen.getByText('Connect to a device'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await open();
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
