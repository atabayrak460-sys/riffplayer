// The writing side of a Connect event stream (SSE), kept separate from the route so its safety rules are
// unit-testable: never write to a response that has ended, drop a client that does not read, and stop
// delivering to a connection whose credentials have been revoked.

import type { ConnectEvent, StreamSink } from './hub.js';

/** The slice of Node's ServerResponse the sink needs (also satisfied by a small fake in tests). */
export interface SseTarget {
  writableEnded: boolean;
  destroyed: boolean;
  /** Bytes queued in memory, not yet accepted by the socket. */
  writableLength: number;
  write(chunk: string): boolean;
  end(): void;
  destroy(): void;
  on(event: string, listener: () => void): unknown;
}

export interface SseSinkOptions {
  /** A client that lets this much pile up unread is dropped instead of growing the server's memory. */
  maxBuffered?: number;
  onOverflow?: () => void;
  /** True once the connection's credentials were revoked — nothing but the "revoked" event may be sent then. */
  isStale?: () => boolean;
  /** Revoke the connection. Return false if that is not possible yet (it is retried on the next delivery). */
  onStale?: () => boolean | void;
  onEnd?: () => void;
}

export const DEFAULT_MAX_BUFFERED = 1024 * 1024;

export function createSseSink(raw: SseTarget, options: SseSinkOptions = {}): StreamSink {
  const maxBuffered = options.maxBuffered ?? DEFAULT_MAX_BUFFERED;
  let overflowed = false;
  let staleHandled = false;

  return {
    send(seq: number, event: ConnectEvent): void {
      if (raw.writableEnded || raw.destroyed) return; // a write after the end would throw
      if (event.name !== 'revoked' && options.isStale?.()) {
        if (!staleHandled) staleHandled = options.onStale?.() !== false;
        return;
      }
      if (raw.writableLength > maxBuffered) {
        if (!overflowed) {
          overflowed = true;
          raw.destroy();
          options.onOverflow?.();
        }
        return;
      }
      raw.write(`id: ${seq}\nevent: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`);
    },
    end(): void {
      if (raw.writableEnded) return;
      options.onEnd?.();
      raw.end();
    },
  };
}

/**
 * Runs [cleanup] when the request goes away — once. If the socket was already gone by the time we got here
 * its "close" event has fired and will never fire again, so cleanup must run now or the device would stay
 * registered forever.
 */
export function attachCleanup(req: Pick<SseTarget, 'destroyed' | 'on'>, cleanup: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cleanup();
  };
  if (req.destroyed) {
    run();
    return;
  }
  req.on('close', run);
}
