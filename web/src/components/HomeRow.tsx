import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  viewAllTo?: string;
  children: ReactNode;
}

/** A horizontally-scrolling row of cards, used throughout the Home page. */
export function HomeRow({ title, viewAllTo, children }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500">{title}</h3>
        {viewAllTo && (
          <Link to={viewAllTo} className="text-xs text-zinc-400 hover:text-white transition-colors">
            See all
          </Link>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">{children}</div>
    </div>
  );
}
