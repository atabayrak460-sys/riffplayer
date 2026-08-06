import { describe, it, expect, vi } from 'vitest';
import { isTypingTarget, handleKeyboardShortcut, type ShortcutActions } from './keyboard';

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

function makeActions(overrides: Partial<ShortcutActions> = {}): ShortcutActions {
  return {
    currentTime: 30,
    duration: 200,
    volume: 0.5,
    togglePlay: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    toggleShuffle: vi.fn(),
    toggleRepeat: vi.fn(),
    toggleMute: vi.fn(),
    toggleShortcutsHelp: vi.fn(),
    ...overrides,
  };
}

function keyEvent(init: Partial<KeyboardEvent> & { code: string }): KeyboardEvent {
  return {
    target: { tagName: 'DIV' },
    repeat: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...init,
  } as unknown as KeyboardEvent;
}

describe('handleKeyboardShortcut', () => {
  it('toggles play on Space and reports handled', () => {
    const actions = makeActions();
    expect(handleKeyboardShortcut(keyEvent({ code: 'Space' }), actions)).toBe(true);
    expect(actions.togglePlay).toHaveBeenCalledOnce();
  });

  it('seeks forward/backward by 5s, clamped to [0, duration]', () => {
    const actions = makeActions({ currentTime: 2 });
    handleKeyboardShortcut(keyEvent({ code: 'ArrowLeft' }), actions);
    expect(actions.seek).toHaveBeenCalledWith(0); // 2 - 5 clamped to 0

    const actions2 = makeActions({ currentTime: 198, duration: 200 });
    handleKeyboardShortcut(keyEvent({ code: 'ArrowRight' }), actions2);
    expect(actions2.seek).toHaveBeenCalledWith(200); // 198 + 5 clamped to duration
  });

  it('adjusts volume up/down by 0.05, clamped to [0, 1]', () => {
    const actions = makeActions({ volume: 0.98 });
    handleKeyboardShortcut(keyEvent({ code: 'ArrowUp' }), actions);
    expect(actions.setVolume).toHaveBeenCalledWith(1);

    const actions2 = makeActions({ volume: 0.02 });
    handleKeyboardShortcut(keyEvent({ code: 'ArrowDown' }), actions2);
    expect(actions2.setVolume).toHaveBeenCalledWith(0);
  });

  it('maps N/P/M/S/R to next/prev/mute/shuffle/repeat', () => {
    const actions = makeActions();
    handleKeyboardShortcut(keyEvent({ code: 'KeyN' }), actions);
    handleKeyboardShortcut(keyEvent({ code: 'KeyP' }), actions);
    handleKeyboardShortcut(keyEvent({ code: 'KeyM' }), actions);
    handleKeyboardShortcut(keyEvent({ code: 'KeyS' }), actions);
    handleKeyboardShortcut(keyEvent({ code: 'KeyR' }), actions);
    expect(actions.next).toHaveBeenCalledOnce();
    expect(actions.prev).toHaveBeenCalledOnce();
    expect(actions.toggleMute).toHaveBeenCalledOnce();
    expect(actions.toggleShuffle).toHaveBeenCalledOnce();
    expect(actions.toggleRepeat).toHaveBeenCalledOnce();
  });

  it('opens the shortcuts help only on shift+/ ("?"), not a bare "/"', () => {
    const actions = makeActions();
    expect(handleKeyboardShortcut(keyEvent({ code: 'Slash', shiftKey: false }), actions)).toBe(false);
    expect(actions.toggleShortcutsHelp).not.toHaveBeenCalled();

    expect(handleKeyboardShortcut(keyEvent({ code: 'Slash', shiftKey: true }), actions)).toBe(true);
    expect(actions.toggleShortcutsHelp).toHaveBeenCalledOnce();
  });

  it('ignores keys while typing in a form field', () => {
    const actions = makeActions();
    const handled = handleKeyboardShortcut(
      keyEvent({ code: 'Space', target: { tagName: 'INPUT' } } as never),
      actions,
    );
    expect(handled).toBe(false);
    expect(actions.togglePlay).not.toHaveBeenCalled();
  });

  it('ignores repeated keydowns (held key) and modifier combos', () => {
    const actions = makeActions();
    expect(handleKeyboardShortcut(keyEvent({ code: 'Space', repeat: true }), actions)).toBe(false);
    expect(handleKeyboardShortcut(keyEvent({ code: 'KeyN', ctrlKey: true }), actions)).toBe(false);
    expect(actions.togglePlay).not.toHaveBeenCalled();
    expect(actions.next).not.toHaveBeenCalled();
  });

  it('ignores unmapped keys', () => {
    const actions = makeActions();
    expect(handleKeyboardShortcut(keyEvent({ code: 'KeyZ' }), actions)).toBe(false);
  });
});
