import type { KeyboardEvent } from 'react';

/**
 * Arrow-key roving focus for a role="radiogroup" of buttons. Moves focus only
 * (Space/Enter on the native button selects), skipping aria-disabled items.
 * Home/End jump to the first/last enabled item.
 */
export function onRovingKeyDown(e: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"])'),
  );
  if (items.length === 0) return;
  const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next = current;
  if (e.key === forward || e.key === 'ArrowDown') next = Math.min(items.length - 1, current + 1);
  else if (e.key === backward || e.key === 'ArrowUp') next = Math.max(0, current - 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = items.length - 1;
  e.preventDefault();
  items[next]?.focus();
}

/** Index of the item that should carry tabIndex=0 (selected, else first enabled). */
export function tabStopIndex(enabled: boolean[], selected: number): number {
  if (selected >= 0 && enabled[selected]) return selected;
  return enabled.findIndex(Boolean);
}
