import { useRouteError, useNavigate, isRouteErrorResponse } from 'react-router-dom';

/**
 * react-router's errorElement fallback — catches anything that escapes the
 * in-app ErrorBoundary around the page Outlet (e.g. a render error thrown by
 * Layout itself, or a route/loader error), so the router never falls back to
 * a blank white screen.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred.';

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-zinc-900 text-center px-6">
      <p className="text-zinc-200 text-lg">Something went wrong.</p>
      <p className="text-zinc-500 text-sm max-w-md">{message}</p>
      <button
        onClick={() => navigate('/', { replace: true })}
        className="px-4 py-2 rounded bg-brand text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Back to home
      </button>
    </div>
  );
}
