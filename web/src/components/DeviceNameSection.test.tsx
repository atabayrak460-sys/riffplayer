// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeviceNameSection } from './DeviceNameSection';
import { useConnectStore } from '../store/connect';

const rename = vi.fn();

function setup(over: Partial<ReturnType<typeof useConnectStore.getState>> = {}) {
  useConnectStore.setState({ status: 'online', deviceName: 'Web · Firefox on Linux', renameThisDevice: rename, ...over });
  return render(<DeviceNameSection />);
}

beforeEach(() => {
  rename.mockReset();
  rename.mockResolvedValue(undefined);
});

describe('DeviceNameSection', () => {
  it('shows the current name in an input with an accessible label', () => {
    setup();
    expect(screen.getByLabelText('Device name')).toHaveValue('Web · Firefox on Linux');
  });

  it('only enables Save once the name has really changed to something non-blank', async () => {
    setup();
    const save = screen.getByRole('button', { name: 'Save' });
    const input = screen.getByLabelText('Device name');
    expect(save).toBeDisabled();

    await userEvent.clear(input);
    expect(save).toBeDisabled();
    await userEvent.type(input, '   ');
    expect(save).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'Web · Firefox on Linux');
    expect(save).toBeDisabled();
    await userEvent.type(input, ' 2');
    expect(save).toBeEnabled();
  });

  it('saves the new name and confirms it', async () => {
    setup();
    const input = screen.getByLabelText('Device name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Living room PC');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(rename).toHaveBeenCalledWith('Living room PC');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('drops the "Saved" note as soon as the name is edited again', async () => {
    setup();
    const input = screen.getByLabelText('Device name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Kitchen');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved');

    await userEvent.type(input, 's');

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('limits the name to 40 characters', () => {
    setup();
    expect(screen.getByLabelText('Device name')).toHaveAttribute('maxlength', '40');
  });

  it('is hidden against a server without Connect', () => {
    const { container } = setup({ status: 'unavailable' });
    expect(container).toBeEmptyDOMElement();
  });
});
