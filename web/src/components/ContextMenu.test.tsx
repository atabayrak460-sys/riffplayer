// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu, useContextMenu, type ContextMenuItem } from './ContextMenu';

function Harness({ items }: { items: ContextMenuItem[] }) {
  const { menu, handlers, close } = useContextMenu();
  return (
    <div>
      <div data-testid="target" {...handlers(items)} />
      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}

function renderMenu() {
  const onClick1 = vi.fn();
  const onClick2 = vi.fn();
  const onClick3 = vi.fn();
  const items: ContextMenuItem[] = [
    { label: 'First', onClick: onClick1 },
    { label: 'Second', onClick: onClick2 },
    { label: 'Third', onClick: onClick3 },
  ];
  render(<Harness items={items} />);
  fireEvent.contextMenu(screen.getByTestId('target'));
  return { onClick1, onClick2, onClick3 };
}

describe('ContextMenu', () => {
  it('has menu/menuitem roles', () => {
    renderMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('focuses the first item on open', () => {
    renderMenu();
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('ArrowDown moves focus to the next item and wraps at the end', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Second' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('ArrowUp moves focus to the previous item and wraps at the start', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
  });

  it('Home/End jump to the first/last item', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('Escape closes the menu', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('activating a focused item via click runs its onClick and closes the menu', () => {
    const { onClick2 } = renderMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Second' }));
    expect(onClick2).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
