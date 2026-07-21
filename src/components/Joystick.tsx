import { useEffect, useRef, useState } from 'react';

/**
 * A touch joystick for phones. Like the KeyPad, it drives games purely by
 * dispatching the same arrow-key events on `window`, so no game needs changing:
 * push up to walk, push left/right to turn. Only shows on touch devices.
 */
const KEY_FOR_CODE: Record<string, string> = {
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
};
function fire(code: string, down: boolean) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: KEY_FOR_CODE[code] ?? code, bubbles: true }));
}

export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const active = useRef<Set<string>>(new Set());
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const setActive = (codes: Set<string>) => {
    codes.forEach((c) => { if (!active.current.has(c)) fire(c, true); });
    active.current.forEach((c) => { if (!codes.has(c)) fire(c, false); });
    active.current = codes;
  };
  const release = () => { pointer.current = null; setKnob({ x: 0, y: 0 }); setActive(new Set()); };

  useEffect(() => {
    // Never leave a direction stuck down if the tab blurs or this unmounts.
    const held = active.current;
    const blur = () => { held.forEach((c) => fire(c, false)); held.clear(); setKnob({ x: 0, y: 0 }); };
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('blur', blur); blur(); };
  }, []);

  const track = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const max = r.width / 2;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    setKnob({ x: dx, y: dy });
    const dead = max * 0.32;
    const codes = new Set<string>();
    if (dy < -dead) codes.add('ArrowUp'); else if (dy > dead) codes.add('ArrowDown');
    if (dx < -dead) codes.add('ArrowLeft'); else if (dx > dead) codes.add('ArrowRight');
    setActive(codes);
  };

  return (
    <div
      className="joystick"
      aria-hidden="true"
      ref={base}
      onPointerDown={(e) => { e.preventDefault(); pointer.current = e.pointerId; e.currentTarget.setPointerCapture?.(e.pointerId); track(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (pointer.current === e.pointerId) track(e.clientX, e.clientY); }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
