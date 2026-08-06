interface MaybeFormElement {
  tagName?: string;
  isContentEditable?: boolean;
}

/** True if a keydown on this target should be treated as text entry, not a shortcut. */
export function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as MaybeFormElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!node.isContentEditable;
}

const SEEK_STEP_S = 5;
const VOLUME_STEP = 0.05;

/** The subset of player-store state/actions global playback shortcuts need. */
export interface ShortcutActions {
  currentTime: number;
  duration: number;
  volume: number;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  next: () => void;
  prev: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleMute: () => void;
  toggleShortcutsHelp: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Global playback shortcuts, active anywhere except while typing (isTypingTarget)
 * or with a modifier held (Ctrl/Alt/Meta — leaves browser/OS shortcuts alone).
 * Returns true if the event was handled (caller should preventDefault()).
 */
export function handleKeyboardShortcut(e: KeyboardEvent, actions: ShortcutActions): boolean {
  if (isTypingTarget(e.target) || e.repeat) return false;
  if (e.ctrlKey || e.altKey || e.metaKey) return false;

  switch (e.code) {
    case 'Space':
      actions.togglePlay();
      return true;
    case 'ArrowRight':
      actions.seek(clamp(actions.currentTime + SEEK_STEP_S, 0, actions.duration || Infinity));
      return true;
    case 'ArrowLeft':
      actions.seek(clamp(actions.currentTime - SEEK_STEP_S, 0, actions.duration || Infinity));
      return true;
    case 'ArrowUp':
      actions.setVolume(clamp(actions.volume + VOLUME_STEP, 0, 1));
      return true;
    case 'ArrowDown':
      actions.setVolume(clamp(actions.volume - VOLUME_STEP, 0, 1));
      return true;
    case 'KeyN':
      actions.next();
      return true;
    case 'KeyP':
      actions.prev();
      return true;
    case 'KeyM':
      actions.toggleMute();
      return true;
    case 'KeyS':
      actions.toggleShuffle();
      return true;
    case 'KeyR':
      actions.toggleRepeat();
      return true;
    case 'Slash':
      if (!e.shiftKey) return false; // '?' is shift+/ on a standard layout
      actions.toggleShortcutsHelp();
      return true;
    default:
      return false;
  }
}

export const SHORTCUTS_HELP: { keys: string; description: string }[] = [
  { keys: 'Space', description: 'Play / pause' },
  { keys: '← / →', description: 'Seek back / forward 5s' },
  { keys: '↑ / ↓', description: 'Volume up / down' },
  { keys: 'N', description: 'Next track' },
  { keys: 'P', description: 'Previous track' },
  { keys: 'M', description: 'Mute / unmute' },
  { keys: 'S', description: 'Toggle shuffle' },
  { keys: 'R', description: 'Toggle repeat' },
  { keys: '?', description: 'Show this help' },
];
