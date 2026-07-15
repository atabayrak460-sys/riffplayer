/**
 * True on iOS/iPadOS, in any browser — Apple requires all iOS browsers (Chrome,
 * Firefox, etc. included) to use WebKit under the hood, so they all share the
 * same aggressive storage-eviction behavior (e.g. ITP's 7-day cap on
 * script-writable storage for origins the user hasn't opened recently). This
 * is used only to show an honest warning, never to gate the download feature.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac; touch support is the tell.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}
