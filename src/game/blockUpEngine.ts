import {
  BOARD, darken, lighten, randomShape, shapeCols, shapeRows, type Shape,
} from './blockUp';
import { storage } from '../lib/storage';

// A fixed internal resolution; CSS scales the canvas so it fits any screen.
const VIEW_W = 460;
const VIEW_H = 610;
const PAD = 14;
const CELL = (VIEW_W - PAD * 2) / BOARD;      // 54
const BOARD_X = PAD;
const BOARD_Y = PAD;
const BOARD_PX = CELL * BOARD;                // 432
const TRAY_Y = BOARD_Y + BOARD_PX + 18;       // 464
const TRAY_H = VIEW_H - TRAY_Y - PAD;         // ~132
const SLOT_W = VIEW_W / 3;
const LIFT = CELL * 1.5;                       // raise the piece above the finger
const BEST_KEY = 'blockUpBest';

export interface BlockUpSnapshot {
  score: number;
  best: number;
  status: 'playing' | 'over';
  lines: number;   // lines cleared by the last drop
  combo: number;   // drops-in-a-row that cleared something
}

interface TrayPiece { shape: Shape; placed: boolean }
interface Drag { slot: number; shape: Shape }

interface Options {
  onUpdate: (snapshot: BlockUpSnapshot) => void;
  onScore: (points: number) => void;
}

export class BlockUpEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: Options;
  private running = true;

  private grid: (string | null)[][] = [];
  private tray: TrayPiece[] = [];
  private drag: Drag | null = null;
  private pointer = { x: 0, y: 0 };
  private score = 0;
  private best = 0;
  private status: 'playing' | 'over' = 'playing';
  private lines = 0;
  private combo = 0;
  private flashes: Array<{ r: number; c: number; color: string; t: number }> = [];

  constructor(canvas: HTMLCanvasElement, options: Options) {
    this.canvas = canvas;
    this.options = options;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.best = Number(storage.get(BEST_KEY) || 0);

    this.reset();
    if (import.meta.env.DEV) (window as unknown as { __BLOCKUP: BlockUpEngine }).__BLOCKUP = this;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    requestAnimationFrame(this.loop);
  }

  private reset() {
    this.grid = Array.from({ length: BOARD }, () => Array.from({ length: BOARD }, () => null as string | null));
    this.score = 0; this.status = 'playing'; this.lines = 0; this.combo = 0;
    this.flashes = [];
    this.refill();
  }

  newGame() { this.drag = null; this.reset(); }

  private refill() {
    this.tray = [randomShape(), randomShape(), randomShape()].map((shape) => ({ shape, placed: false }));
  }

  // ---- coordinates -----------------------------------------------------------

  private toView(clientX: number, clientY: number) {
    const box = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - box.left) / box.width) * VIEW_W,
      y: ((clientY - box.top) / box.height) * VIEW_H,
    };
  }

  /** Which board square the currently-dragged piece would drop onto. */
  private anchor(): { row: number; col: number; valid: boolean } | null {
    if (!this.drag) return null;
    const { shape } = this.drag;
    const cols = shapeCols(shape), rows = shapeRows(shape);
    const originX = this.pointer.x - (cols * CELL) / 2;
    const originY = this.pointer.y - LIFT - (rows * CELL) / 2;
    const col = Math.round((originX - BOARD_X) / CELL);
    const row = Math.round((originY - BOARD_Y) / CELL);
    return { row, col, valid: this.fits(shape, row, col) };
  }

  private fits(shape: Shape, row: number, col: number) {
    return shape.cells.every(([dr, dc]) => {
      const r = row + dr, c = col + dc;
      return r >= 0 && c >= 0 && r < BOARD && c < BOARD && !this.grid[r][c];
    });
  }

  private canPlaceAnywhere(shape: Shape) {
    for (let row = 0; row <= BOARD - shapeRows(shape); row += 1) {
      for (let col = 0; col <= BOARD - shapeCols(shape); col += 1) {
        if (this.fits(shape, row, col)) return true;
      }
    }
    return false;
  }

  // ---- input -----------------------------------------------------------------

  private onDown = (event: PointerEvent) => {
    if (this.status !== 'playing') return;
    const p = this.toView(event.clientX, event.clientY);
    this.pointer = p;
    if (p.y < TRAY_Y) return;                 // only the tray starts a drag
    const slot = Math.floor(p.x / SLOT_W);
    if (slot < 0 || slot > 2) return;
    const piece = this.tray[slot];
    if (!piece || piece.placed) return;
    this.drag = { slot, shape: piece.shape };
    event.preventDefault();
  };

  private onMove = (event: PointerEvent) => {
    if (!this.drag) return;
    this.pointer = this.toView(event.clientX, event.clientY);
    event.preventDefault();
  };

  private onUp = () => {
    if (!this.drag) return;
    const spot = this.anchor();
    const { slot, shape } = this.drag;
    this.drag = null;
    if (!spot || !spot.valid) return;         // misdrop — the piece goes back
    this.place(shape, spot.row, spot.col, slot);
  };

  // ---- placing & clearing ----------------------------------------------------

  private place(shape: Shape, row: number, col: number, slot: number) {
    shape.cells.forEach(([dr, dc]) => { this.grid[row + dr][col + dc] = shape.color; });
    this.tray[slot].placed = true;
    let gained = shape.cells.length;          // a point per block set down

    // full rows and columns clear together
    const fullRows: number[] = [];
    const fullCols: number[] = [];
    for (let r = 0; r < BOARD; r += 1) if (this.grid[r].every(Boolean)) fullRows.push(r);
    for (let c = 0; c < BOARD; c += 1) if (this.grid.every((rowArr) => rowArr[c])) fullCols.push(c);
    const cleared = fullRows.length + fullCols.length;
    this.lines = cleared;

    if (cleared > 0) {
      const toClear = new Set<string>();
      fullRows.forEach((r) => { for (let c = 0; c < BOARD; c += 1) toClear.add(`${r},${c}`); });
      fullCols.forEach((c) => { for (let r = 0; r < BOARD; r += 1) toClear.add(`${r},${c}`); });
      toClear.forEach((key) => {
        const [r, c] = key.split(',').map(Number);
        this.flashes.push({ r, c, color: this.grid[r][c] ?? '#fff', t: 1 });
        this.grid[r][c] = null;
      });
      this.combo += 1;
      // clearing several lines at once is worth a lot more than one at a time
      const bonus = cleared * cleared * 10 + (this.combo > 1 ? this.combo * 5 : 0);
      gained += bonus;
      this.options.onScore(bonus);
    } else {
      this.combo = 0;
    }

    this.score += gained;
    if (this.score > this.best) { this.best = this.score; storage.set(BEST_KEY, String(this.best)); }

    // out of pieces → deal three more
    if (this.tray.every((piece) => piece.placed)) this.refill();

    // game over when nothing left in the tray can be placed
    const alive = this.tray.some((piece) => !piece.placed && this.canPlaceAnywhere(piece.shape));
    if (!alive) {
      this.status = 'over';
      if (this.score > this.best) { this.best = this.score; storage.set(BEST_KEY, String(this.best)); }
    }
  }

  // ---- drawing ---------------------------------------------------------------

  private rr(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  private block(x: number, y: number, s: number, color: string, alpha = 1) {
    const c = this.ctx;
    c.globalAlpha = alpha;
    this.rr(x + 2, y + 3, s - 4, s - 4, s * 0.24); c.fillStyle = darken(color, 0.3); c.fill();
    this.rr(x + 2, y + 2, s - 4, s - 6, s * 0.24); c.fillStyle = color; c.fill();
    c.globalAlpha = alpha * 0.55;
    this.rr(x + s * 0.16, y + s * 0.14, s * 0.42, s * 0.26, s * 0.12); c.fillStyle = lighten(color, 0.6); c.fill();
    c.globalAlpha = 1;
  }

  private emptyCell(x: number, y: number, s: number) {
    const c = this.ctx;
    this.rr(x + 3, y + 3, s - 6, s - 6, s * 0.22); c.fillStyle = '#efe7f6'; c.fill();
  }

  private draw() {
    const c = this.ctx;
    c.clearRect(0, 0, VIEW_W, VIEW_H);

    // board panel
    this.rr(BOARD_X - 6, BOARD_Y - 6, BOARD_PX + 12, BOARD_PX + 12, 20);
    c.fillStyle = '#dcd0ec'; c.fill();

    for (let r = 0; r < BOARD; r += 1) {
      for (let col = 0; col < BOARD; col += 1) {
        const x = BOARD_X + col * CELL, y = BOARD_Y + r * CELL;
        const cell = this.grid[r][col];
        if (cell) this.block(x, y, CELL, cell);
        else this.emptyCell(x, y, CELL);
      }
    }

    // clearing flashes
    this.flashes.forEach((flash) => {
      const x = BOARD_X + flash.c * CELL, y = BOARD_Y + flash.r * CELL;
      c.globalAlpha = flash.t;
      this.rr(x + 2, y + 2, CELL - 4, CELL - 4, CELL * 0.24); c.fillStyle = '#ffffff'; c.fill();
      c.globalAlpha = 1;
    });

    // drop preview (ghost) under a valid drag
    const spot = this.anchor();
    if (this.drag && spot && spot.valid) {
      this.drag.shape.cells.forEach(([dr, dc]) => {
        const x = BOARD_X + (spot.col + dc) * CELL, y = BOARD_Y + (spot.row + dr) * CELL;
        this.block(x, y, CELL, this.drag!.shape.color, 0.4);
      });
    }

    // the tray of three
    this.tray.forEach((piece, slot) => {
      if (piece.placed) return;
      if (this.drag && this.drag.slot === slot) return;   // it is in your hand
      this.drawTrayPiece(piece.shape, slot);
    });

    // the piece you are holding, full size, floating above the finger
    if (this.drag) {
      const shape = this.drag.shape;
      const cols = shapeCols(shape), rows = shapeRows(shape);
      const originX = this.pointer.x - (cols * CELL) / 2;
      const originY = this.pointer.y - LIFT - (rows * CELL) / 2;
      shape.cells.forEach(([dr, dc]) => this.block(originX + dc * CELL, originY + dr * CELL, CELL, shape.color, 0.95));
    }
  }

  private drawTrayPiece(shape: Shape, slot: number) {
    const cols = shapeCols(shape), rows = shapeRows(shape);
    const cell = Math.min(30, (SLOT_W - 24) / cols, (TRAY_H - 24) / rows);
    const w = cols * cell, h = rows * cell;
    const cx = slot * SLOT_W + SLOT_W / 2;
    const cy = TRAY_Y + TRAY_H / 2;
    const originX = cx - w / 2, originY = cy - h / 2;
    shape.cells.forEach(([dr, dc]) => this.block(originX + dc * cell, originY + dr * cell, cell, shape.color));
  }

  private snapshot(): BlockUpSnapshot {
    return { score: this.score, best: this.best, status: this.status, lines: this.lines, combo: this.combo };
  }

  resize() { /* fixed internal resolution — CSS scales the canvas */ }

  dispose() {
    this.running = false;
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  private loop = () => {
    if (!this.running) return;
    this.flashes = this.flashes.filter((flash) => { flash.t -= 0.06; return flash.t > 0; });
    this.draw();
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
