// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from './Toast';
import { useToastStore } from '../store/toast';

beforeEach(() => {
  useToastStore.setState({ message: null });
});

describe('Toast', () => {
  it('renders nothing when there is no message', () => {
    const { container } = render(<Toast />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the current message', () => {
    useToastStore.setState({ message: 'Something failed' });
    render(<Toast />);
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('dismisses on close button click', async () => {
    useToastStore.setState({ message: 'Something failed' });
    render(<Toast />);

    await userEvent.click(screen.getByLabelText('Dismiss'));

    expect(useToastStore.getState().message).toBeNull();
  });

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers();
    useToastStore.setState({ message: 'Something failed' });
    render(<Toast />);

    vi.advanceTimersByTime(5000);

    expect(useToastStore.getState().message).toBeNull();
    vi.useRealTimers();
  });
});
