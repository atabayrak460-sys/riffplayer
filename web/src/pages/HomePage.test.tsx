// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePage } from './HomePage';

vi.mock('../components/home/ContinueListeningSection', () => ({ ContinueListeningSection: () => <p>continue</p> }));
vi.mock('../components/home/MostPlayedSection', () => ({ MostPlayedSection: () => <p>most played</p> }));
vi.mock('../components/home/RediscoverSection', () => ({ RediscoverSection: () => <p>rediscover</p> }));
vi.mock('../components/home/WrappedPreviewSection', () => ({ WrappedPreviewSection: () => <p>wrapped</p> }));

describe('HomePage', () => {
  it('stacks the four sections in order', () => {
    render(<HomePage />);

    expect(screen.getAllByText(/^(continue|most played|rediscover|wrapped)$/).map((e) => e.textContent)).toEqual([
      'continue', 'most played', 'rediscover', 'wrapped',
    ]);
  });
});
