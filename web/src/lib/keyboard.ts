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
