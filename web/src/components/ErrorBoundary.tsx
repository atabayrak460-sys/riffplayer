import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in its subtree so one broken page can't white-screen
 * the whole app. React error boundaries only support class components —
 * there's no hook equivalent for getDerivedStateFromError/componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught render error', error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center h-full">
        <p className="text-zinc-300 text-sm">Something went wrong loading this page.</p>
        <button
          onClick={this.reset}
          className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-200 text-sm hover:bg-zinc-700 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}
