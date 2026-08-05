import { describe, it, expect } from 'vitest';
import { escapeLike } from '../../db/likeEscape.js';

describe('escapeLike', () => {
  it('escapes underscore', () => {
    expect(escapeLike('A_B')).toBe('A\\_B');
  });

  it('escapes percent', () => {
    expect(escapeLike('A%B')).toBe('A\\%B');
  });

  it('escapes a literal backslash', () => {
    expect(escapeLike('A\\B')).toBe('A\\\\B');
  });

  it('leaves ordinary characters untouched', () => {
    expect(escapeLike('Test Artist 123')).toBe('Test Artist 123');
  });

  it('escapes multiple wildcards in one string', () => {
    expect(escapeLike('50%_off')).toBe('50\\%\\_off');
  });
});
