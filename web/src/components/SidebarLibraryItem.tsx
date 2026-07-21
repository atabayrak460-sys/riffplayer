import { NavLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  pinLibraryItem, unpinLibraryItem, recordLibraryInteraction, type LibraryItemType,
} from '../api/subsonic';
import { ContextMenu, useContextMenu } from './ContextMenu';

interface Props {
  to: string;
  label: string;
  icon: string;
  /** Playlist rows use a solid icon; the fixed system rows use the sidebar's stroke style. */
  iconFill?: boolean;
  itemType: LibraryItemType;
  itemKey: string;
  pinned: boolean;
}

const PIN_ICON = 'M12 2a5 5 0 0 0-5 5c0 3.5 5 10 5 10s5-6.5 5-10a5 5 0 0 0-5-5z';

export function SidebarLibraryItem({ to, label, icon, iconFill, itemType, itemKey, pinned }: Props) {
  const qc = useQueryClient();
  const { menu, handlers, close } = useContextMenu();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['library-sidebar-state'] });
  const pinMutation = useMutation({ mutationFn: () => pinLibraryItem(itemType, itemKey), onSuccess: invalidate });
  const unpinMutation = useMutation({ mutationFn: () => unpinLibraryItem(itemType, itemKey), onSuccess: invalidate });

  const interact = () => {
    recordLibraryInteraction(itemType, itemKey).then(invalidate).catch(() => {/* best-effort */});
  };

  const contextItems = pinned
    ? [{ label: 'Unpin', onClick: () => unpinMutation.mutate() }]
    : [{ label: 'Pin', onClick: () => pinMutation.mutate() }];

  return (
    <>
      <NavLink
        to={to}
        onClick={interact}
        {...handlers(contextItems)}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`
        }
      >
        {iconFill ? (
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d={icon} />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        )}
        <span className="truncate flex-1">{label}</span>
        {pinned && (
          <svg className="w-3 h-3 text-zinc-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d={PIN_ICON} />
          </svg>
        )}
      </NavLink>
      <ContextMenu menu={menu} onClose={close} />
    </>
  );
}
