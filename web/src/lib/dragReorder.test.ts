import { describe, it, expect } from 'vitest';
import { resolveDragReorderIndices } from './dragReorder';

describe('resolveDragReorderIndices', () => {
  it('resolves a valid drag into from/to indices', () => {
    expect(resolveDragReorderIndices(['a', 'b', 'c'], 'a', 'c')).toEqual({ from: 0, to: 2 });
  });

  it('returns null when dropped on itself', () => {
    expect(resolveDragReorderIndices(['a', 'b', 'c'], 'b', 'b')).toBeNull();
  });

  it('returns null when dropped outside any droppable (over is undefined)', () => {
    expect(resolveDragReorderIndices(['a', 'b', 'c'], 'b', undefined)).toBeNull();
  });

  it('returns null when the active id is not in the list', () => {
    expect(resolveDragReorderIndices(['a', 'b', 'c'], 'zzz', 'b')).toBeNull();
  });

  it('returns null when the over id is not in the list', () => {
    expect(resolveDragReorderIndices(['a', 'b', 'c'], 'a', 'zzz')).toBeNull();
  });

  it('resolves a backward drag (moving an item earlier in the list)', () => {
    expect(resolveDragReorderIndices(['a', 'b', 'c'], 'c', 'a')).toEqual({ from: 2, to: 0 });
  });
});
