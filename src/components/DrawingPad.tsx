import { useEffect, useRef, useState } from 'react';

/**
 * Draw a picture for a page, with a finger or a mouse.
 *
 * Deliberately a handful of fat crayons rather than a paint program: a child
 * should be able to draw something in ten seconds without reading anything.
 */

const COLOURS = ['#2b241d', '#c2452f', '#e0894a', '#f2c94c', '#4f7a45', '#3f7a8f', '#7a4fb0', '#d06a9a', '#ffffff'];
const SIZES = [6, 14, 28];
const W = 720;
const H = 460;

export function DrawingPad({ onDone, onClose }: { onDone: (blob: Blob) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [colour, setColour] = useState(COLOURS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [erasing, setErasing] = useState(false);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  /** Every finished stroke, so Undo can take one back. */
  const history = useRef<ImageData[]>([]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, W, H);
  }, []);

  /** Where a pointer is on the canvas, whatever size it is drawn at. */
  const at = (event: React.PointerEvent) => {
    const box = (event.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * W,
      y: ((event.clientY - box.top) / box.height) * H,
    };
  };

  const start = (event: React.PointerEvent) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    event.preventDefault();
    // Remember the page as it was, so this stroke can be undone.
    history.current.push(ctx.getImageData(0, 0, W, H));
    if (history.current.length > 20) history.current.shift();
    drawing.current = true;
    last.current = at(event);
  };

  const move = (event: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const now = at(event);
    ctx.strokeStyle = erasing ? '#fffdf8' : colour;
    ctx.lineWidth = erasing ? size * 2 : size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(now.x, now.y);
    ctx.stroke();
    last.current = now;
  };

  const stop = () => { drawing.current = false; };

  const undo = () => {
    const ctx = canvas.current?.getContext('2d');
    const back = history.current.pop();
    if (ctx && back) ctx.putImageData(back, 0, 0);
  };

  const clear = () => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    history.current.push(ctx.getImageData(0, 0, W, H));
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, W, H);
  };

  const keep = () => {
    canvas.current?.toBlob((blob) => { if (blob) onDone(blob); }, 'image/png');
  };

  return (
    <div className="draw-backdrop" onClick={onClose}>
      <div className="draw-pad" onClick={(e) => e.stopPropagation()}>
        <div className="draw-top">
          <h3>🎨 Draw a picture</h3>
          <button className="loc-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <canvas
          ref={canvas}
          className="draw-canvas"
          width={W}
          height={H}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
        />

        <div className="draw-colours">
          {COLOURS.map((c) => (
            <button
              key={c}
              className={`draw-swatch ${colour === c && !erasing ? 'on' : ''}`}
              style={{ background: c }}
              aria-label={`colour ${c}`}
              onClick={() => { setColour(c); setErasing(false); }}
            />
          ))}
          <button className={`draw-rubber ${erasing ? 'on' : ''}`} onClick={() => setErasing(!erasing)}>🧽</button>
        </div>

        <div className="draw-sizes">
          {SIZES.map((s) => (
            <button key={s} className={size === s ? 'on' : ''} onClick={() => setSize(s)}>
              <i style={{ width: s, height: s }} />
            </button>
          ))}
          <button className="draw-undo" onClick={undo}>↶ Undo</button>
          <button className="draw-clear" onClick={clear}>Start again</button>
        </div>

        <button className="draw-keep" onClick={keep}>✓ Put it on the page</button>
      </div>
    </div>
  );
}
