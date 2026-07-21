import { describe, it, expect } from 'vitest';
import { orderLibraryRows, type LibraryRow, type LibrarySidebarStateEntry } from './librarySidebarOrder';

function row(itemKey: string, itemType: LibraryRow['itemType'] = 'system'): LibraryRow {
  return { itemType, itemKey, to: `/${itemKey}`, label: itemKey };
}

function state(
  itemType: string, itemKey: string, opts: { pinnedAt?: string | null; lastInteractedAt?: string } = {},
): LibrarySidebarStateEntry {
  return {
    itemType, itemKey,
    pinnedAt: opts.pinnedAt ?? null,
    lastInteractedAt: opts.lastInteractedAt ?? '2024-01-01T00:00:00.000Z',
  };
}

describe('orderLibraryRows', () => {
  it('keeps items never interacted with in their original order, all in "dynamic"', () => {
    const rows = [row('a'), row('b'), row('c')];
    const { pinned, dynamic } = orderLibraryRows(rows, []);

    expect(pinned).toHaveLength(0);
    expect(dynamic.map((r) => r.itemKey)).toEqual(['a', 'b', 'c']);
  });

  it('sorts interacted items to the top of "dynamic", most-recent first, untouched items after', () => {
    const rows = [row('a'), row('b'), row('c')];
    const st = [
      state('system', 'a', { lastInteractedAt: '2024-01-01T00:00:00.000Z' }),
      state('system', 'c', { lastInteractedAt: '2024-06-01T00:00:00.000Z' }),
    ];
    const { dynamic } = orderLibraryRows(rows, st);

    // c was interacted with more recently than a; b was never touched and sinks to the end
    expect(dynamic.map((r) => r.itemKey)).toEqual(['c', 'a', 'b']);
  });

  it('pins sit in their own group, most-recently-pinned first, and do not appear in dynamic', () => {
    const rows = [row('a'), row('b'), row('c')];
    const st = [
      state('system', 'a', { pinnedAt: '2024-01-01T00:00:00.000Z' }),
      state('system', 'c', { pinnedAt: '2024-06-01T00:00:00.000Z' }),
    ];
    const { pinned, dynamic } = orderLibraryRows(rows, st);

    expect(pinned.map((r) => r.itemKey)).toEqual(['c', 'a']);
    expect(dynamic.map((r) => r.itemKey)).toEqual(['b']);
  });

  it('a pinned item is excluded from recency sorting even if it also has interactions', () => {
    const rows = [row('a'), row('b')];
    const st = [
      state('system', 'a', { pinnedAt: '2024-01-01T00:00:00.000Z', lastInteractedAt: '2024-01-01T00:00:00.000Z' }),
      state('system', 'b', { lastInteractedAt: '2024-06-01T00:00:00.000Z' }),
    ];
    const { pinned, dynamic } = orderLibraryRows(rows, st);

    expect(pinned.map((r) => r.itemKey)).toEqual(['a']);
    expect(dynamic.map((r) => r.itemKey)).toEqual(['b']);
  });

  it('distinguishes items by (itemType, itemKey) — a playlist id does not collide with a system key', () => {
    const rows = [row('1', 'system'), row('1', 'playlist')];
    const st = [state('playlist', '1', { pinnedAt: '2024-01-01T00:00:00.000Z' })];
    const { pinned, dynamic } = orderLibraryRows(rows, st);

    expect(pinned).toHaveLength(1);
    expect(pinned[0].itemType).toBe('playlist');
    expect(dynamic).toHaveLength(1);
    expect(dynamic[0].itemType).toBe('system');
  });
});
