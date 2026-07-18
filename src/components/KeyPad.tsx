import { useEffect, useRef } from 'react';

/**
 * On-screen controls for touch devices (iPads, phones) that have no keyboard.
 *
 * The games are driven entirely by real keyboard events on `window`, so rather
 * than change a single line of any game, these buttons just *dispatch* the same
 * keyboard events. Hold a button → keydown; release → keyup. It only shows on
 * touch devices, so keyboard players never see it.
 */

const KEY_FOR_CODE: Record<string, string> = {
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyF: 'f',
  Space: ' ', ShiftLeft: 'Shift', Digit1: '1', Digit2: '2', Digit3: '3',
};

function fire(codes: string[], down: boolean) {
  const type = down ? 'keydown' : 'keyup';
  codes.forEach((code) => window.dispatchEvent(
    new KeyboardEvent(type, { code, key: KEY_FOR_CODE[code] ?? code, bubbles: true }),
  ));
}

const DIRS: Record<string, string[]> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
};

export interface PadAction { codes: string[]; label: string; wide?: boolean }

interface KeyPadProps {
  dirs?: Array<'up' | 'down' | 'left' | 'right'>;
  actions?: PadAction[];
}

export function KeyPad({ dirs = ['up', 'down', 'left', 'right'], actions = [] }: KeyPadProps) {
  // Keep every code a finger is holding, so nothing gets stuck down.
  const held = useRef(new Map<number, string[]>());

  useEffect(() => {
    // Safety net: if the tab loses focus mid-press (or the pad unmounts), let go
    // of every held key so nothing stays stuck down.
    const held0 = held.current;
    const releaseAll = () => { held0.forEach((codes) => fire(codes, false)); held0.clear(); };
    window.addEventListener('blur', releaseAll);
    return () => { window.removeEventListener('blur', releaseAll); releaseAll(); };
  }, []);

  const bind = (codes: string[]) => ({
    onPointerDown: (event: React.PointerEvent) => {
      event.preventDefault();
      held.current.set(event.pointerId, codes);
      fire(codes, true);
    },
    onPointerUp: (event: React.PointerEvent) => {
      held.current.delete(event.pointerId);
      fire(codes, false);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (!held.current.has(event.pointerId)) return;
      held.current.delete(event.pointerId);
      fire(codes, false);
    },
    onPointerCancel: (event: React.PointerEvent) => {
      held.current.delete(event.pointerId);
      fire(codes, false);
    },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });

  return (
    <div className="keypad" aria-hidden="true">
      <div className="keypad-dpad">
        {dirs.includes('up') && <button className="kp-up" {...bind(DIRS.up)}>▲</button>}
        {dirs.includes('left') && <button className="kp-left" {...bind(DIRS.left)}>◀</button>}
        {dirs.includes('right') && <button className="kp-right" {...bind(DIRS.right)}>▶</button>}
        {dirs.includes('down') && <button className="kp-down" {...bind(DIRS.down)}>▼</button>}
      </div>
      <div className="keypad-actions">
        {actions.map((action, i) => (
          <button key={i} className={action.wide ? 'kp-action kp-wide' : 'kp-action'} {...bind(action.codes)}>{action.label}</button>
        ))}
      </div>
    </div>
  );
}
