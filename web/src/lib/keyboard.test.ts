import { describe, it, expect } from 'vitest';
import { isTypingTarget } from './keyboard';

describe('isTypingTarget', () => {
  it('treats input, textarea, and select as typing targets', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
  });

  it('treats contentEditable elements as typing targets', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  it('does not treat a plain div or button as a typing target', () => {
    expect(isTypingTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
  });

  it('handles null', () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
