import { useState } from 'react';
import { KeyPad } from './KeyPad';
import { Joystick } from './Joystick';

/**
 * The touch controls for the 3-D worlds: pick arrow buttons, a thumb joystick,
 * or your finger. Every mode just dispatches the same keyboard events the games
 * already listen for, so no world had to change how it reads input.
 *
 * The finger pad itself is NOT rendered here — a page must place `<FingerPad>`
 * right after its canvas so the panels and buttons drawn afterwards still take
 * taps where they overlap it. This renders the picker and everything else.
 */
export type WalkControlMode = 'buttons' | 'joystick' | 'finger';

const MODES: Array<{ id: WalkControlMode; label: string }> = [
  { id: 'buttons', label: '🎮 Buttons' },
  { id: 'joystick', label: '🕹️ Joystick' },
  { id: 'finger', label: '👆 Finger' },
];

/** The action button (⤴) fires the same Space key the worlds listen for. */
function fireKey(code: string, down: boolean) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true }));
}

/**
 * Remember how someone likes to walk, per world, so nobody has to re-pick their
 * controls every visit.
 */
export function useWalkControls(storageKey: string): [WalkControlMode, (mode: WalkControlMode) => void] {
  const [mode, setMode] = useState<WalkControlMode>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'buttons' || saved === 'joystick' || saved === 'finger') return saved;
    } catch { /* private browsing — just use the default */ }
    return 'buttons';
  });
  return [mode, (next) => {
    setMode(next);
    try { localStorage.setItem(storageKey, next); } catch { /* nothing to remember it with */ }
  }];
}

interface WalkControlsProps {
  mode: WalkControlMode;
  onPick: (mode: WalkControlMode) => void;
  /** What the ⤴ button does in this world, for screen readers. */
  actionLabel?: string;
}

export function WalkControls({ mode, onPick, actionLabel = 'Jump / pick up' }: WalkControlsProps) {
  return <>
    <div className="control-mode-toggle" role="group" aria-label="How to walk">
      {MODES.map(({ id, label }) => <button
        key={id}
        className={mode === id ? 'on' : ''}
        aria-pressed={mode === id}
        onClick={() => onPick(id)}
      >{label}</button>)}
    </div>
    {mode === 'buttons' && <KeyPad dirs={['up', 'down', 'left', 'right']} actions={[{ codes: ['Space'], label: '⤴' }]} />}
    {mode !== 'buttons' && <>
      {mode === 'joystick' && <Joystick />}
      <button
        className="joy-action" aria-label={actionLabel}
        onPointerDown={(e) => { e.preventDefault(); fireKey('Space', true); }}
        onPointerUp={() => fireKey('Space', false)}
        onPointerLeave={() => fireKey('Space', false)}
        onPointerCancel={() => fireKey('Space', false)}
        onContextMenu={(e) => e.preventDefault()}
      >⤴</button>
    </>}
  </>;
}
