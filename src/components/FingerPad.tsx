import { useEffect, useRef, useState } from 'react';

/**
 * "Walk with your finger": put a finger down anywhere on the left of the world
 * and drag the way you want to go — the stick appears wherever you touched, so
 * there is no small circle to hunt for. Like the KeyPad and the Joystick it only
 * dispatches the arrow-key events the games already listen for, so no game had
 * to change. A tap without a drag is a pick/interact.
 *
 * It deliberately covers only the left half, so dragging on the right still
 * looks around and tapping the right still picks things up.
 */
const KEY_FOR_CODE: Record<string, string> = {
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
};
function fire(code: string, down: boolean) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: KEY_FOR_CODE[code] ?? code, bubbles: true }));
}

/** How far the stick can be pushed, and how far counts as "not really a push". */
const REACH = 68;
const DEAD = 18;

interface FingerPadProps {
  /** A tap (finger down and up without dragging) — used to pick/chop/fish. */
  onTap?: () => void;
  /** Shown until the first drag, so a new player knows the area is for walking. */
  hint?: string;
}

export function FingerPad({ onTap, hint = '👆 Drag anywhere here to walk' }: FingerPadProps) {
  const pointer = useRef<number | null>(null);
  // Where the finger went down: in page coordinates for the maths, and in
  // pad coordinates for drawing the stick (so no ancestor's transform matters).
  const origin = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const active = useRef<Set<string>>(new Set());
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [used, setUsed] = useState(false);

  const setActive = (codes: Set<string>) => {
    codes.forEach((c) => { if (!active.current.has(c)) fire(c, true); });
    active.current.forEach((c) => { if (!codes.has(c)) fire(c, false); });
    active.current = codes;
  };

  /** Let go: stop walking, and if the finger never moved, treat it as a tap. */
  const release = (pointerId: number, tapped: boolean) => {
    if (pointer.current !== pointerId) return;   // a second finger, not the one steering
    pointer.current = null;
    setStick(null);
    setActive(new Set());
    if (tapped && !moved.current) onTap?.();
  };

  useEffect(() => {
    // Never leave a direction stuck down if the tab blurs or this unmounts.
    const held = active.current;
    const blur = () => { held.forEach((c) => fire(c, false)); held.clear(); setStick(null); };
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('blur', blur); blur(); };
  }, []);

  const track = (clientX: number, clientY: number) => {
    let dx = clientX - origin.current.x, dy = clientY - origin.current.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > REACH) { dx = (dx / dist) * REACH; dy = (dy / dist) * REACH; }
    if (dist > 6) { moved.current = true; setUsed(true); }
    setStick((at) => (at ? { ...at, dx, dy } : at));
    const codes = new Set<string>();
    if (dy < -DEAD) codes.add('ArrowUp'); else if (dy > DEAD) codes.add('ArrowDown');
    if (dx < -DEAD) codes.add('ArrowLeft'); else if (dx > DEAD) codes.add('ArrowRight');
    setActive(codes);
  };

  return (
    <div
      className="finger-pad"
      aria-hidden="true"
      onPointerDown={(e) => {
        e.preventDefault();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        origin.current = { x: e.clientX, y: e.clientY };
        moved.current = false;
        setStick({ x: e.clientX - rect.left, y: e.clientY - rect.top, dx: 0, dy: 0 });
      }}
      onPointerMove={(e) => { if (pointer.current === e.pointerId) track(e.clientX, e.clientY); }}
      onPointerUp={(e) => release(e.pointerId, true)}
      onPointerCancel={(e) => release(e.pointerId, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stick
        ? <span className="finger-stick" style={{ left: stick.x, top: stick.y }}>
            <i style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
          </span>
        : !used && <span className="finger-hint">{hint}</span>}
    </div>
  );
}
