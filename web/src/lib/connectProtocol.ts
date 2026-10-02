// Pure helpers for RiffPlayer Connect (see docs/CONNECT-DESIGN.md) — no network, no stores.

import type { PublicState } from '../api/connect';

export type SseItem =
  | { kind: 'event'; id?: number; name: string; data: unknown }
  | { kind: 'comment' };

/**
 * Incremental parser for a text/event-stream body. Feed it decoded chunks as they arrive; it returns the
 * complete items found so far and keeps the unfinished tail for the next chunk. Comment lines (": ping")
 * are reported too, because the heartbeat is how the client knows the connection is alive.
 */
export class SseParser {
  private buffer = '';

  push(text: string): SseItem[] {
    this.buffer += text.replace(/\r\n/g, '\n');
    const items: SseItem[] = [];
    let end: number;
    while ((end = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const item = parseBlock(block);
      if (item) items.push(item);
    }
    return items;
  }
}

function parseBlock(block: string): SseItem | null {
  if (block.trim() === '') return null;
  let name: string | undefined;
  let id: number | undefined;
  const data: string[] = [];
  let sawComment = false;
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) { sawComment = true; continue; }
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') name = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id' && /^\d+$/.test(value)) id = Number(value);
    // "retry:" and unknown fields are ignored
  }
  if (name === undefined || data.length === 0) return sawComment ? { kind: 'comment' } : null;
  try {
    return { kind: 'event', id, name, data: JSON.parse(data.join('\n')) };
  } catch {
    return null; // a malformed event is dropped rather than breaking the stream
  }
}

/** Where the remote track is *now*, extrapolated from the report (server clock), clamped to its length. */
export function positionNow(state: PublicState, serverNowMs: number): number {
  const raw = state.playing ? state.positionMs + Math.max(0, serverNowMs - state.positionAtMs) : state.positionMs;
  return state.durationMs != null ? Math.min(raw, state.durationMs) : raw;
}

/** Reconnect delay: 1 s doubling up to 30 s, with ±20% jitter so many clients don't retry in lockstep. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + random() * 0.4));
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux|X11/, 'Linux'],
];

/** "Web · Firefox on Linux" — a readable default the user can rename. */
export function defaultDeviceName(userAgent: string): string {
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && system) return `Web · ${browser} on ${system}`;
  return `Web · ${browser ?? system ?? 'Browser'}`;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
