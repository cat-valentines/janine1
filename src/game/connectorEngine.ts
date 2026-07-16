import {
  BOARD_BG, CELL, COLS, GAP, ROWS, SLOT_BG, VIEW_H, VIEW_W, adjacent, colourFor, hasMove,
  spawnValue, type Cell,
} from './connector';

export interface ConnectorSnapshot {
  score: number;
  best: number;
  /** Length of the chain being drawn right now, for the live hint. */
  chain: number;
  chainSum: number;
  chainResult: number;
  status: 'playing' | 'over';
}

interface EngineOptions {
  best: number;
  onUpdate: (snapshot: ConnectorSnapshot) => void;
  onScore: (points: number) => void;
}

export class ConnectorEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private options: EngineOptions;

  private grid: number[][] = [];
  /** Per-cell vertical pixel offset, eased to 0, for the falling animation. */
  private fall: number[][] = [];
  private chain: Cell[] = [];
  private required = 0;
  private dragging = false;

  private score = 0;
  private best = 0;
  private status: 'playing' | 'over' = 'playing';

  private running = true;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.canvas = canvas;
    this.options = options;
    this.best = options.best;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;

    this.newBoard();
    // Lets the headless test find equal pairs and swipe them. Dev build only.
    if (import.meta.env.DEV) (window as unknown as { __CONN: ConnectorEngine }).__CONN = this;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private newBoard() {
    do {
      this.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, spawnValue));
    } while (!hasMove(this.grid));
    this.fall = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
  }

  // ---- geometry ----------------------------------------------------------

  private cellX = (c: number) => GAP + c * (CELL + GAP);
  private cellY = (r: number) => GAP + r * (CELL + GAP);
  /** VIEW-space centre of a cell — the test harness pokes here too. */
  worldCenter(c: number, r: number) { return { x: this.cellX(c) + CELL / 2, y: this.cellY(r) + CELL / 2 }; }

  private cellAt(clientX: number, clientY: number): Cell | null {
    const box = this.canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * VIEW_W;
    const y = ((clientY - box.top) / box.height) * VIEW_H;
    const c = Math.floor((x - GAP) / (CELL + GAP));
    const r = Math.floor((y - GAP) / (CELL + GAP));
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    // Ignore the gaps between cells, so a wobbly swipe does not jump squares.
    if (x - this.cellX(c) > CELL || y - this.cellY(r) > CELL) return null;
    return { c, r };
  }

  // ---- chain building ----------------------------------------------------

  private inChain = (cell: Cell) => this.chain.some((item) => item.c === cell.c && item.r === cell.r);

  /** Recompute the running "required value" after a backtrack. */
  private recompute() {
    if (!this.chain.length) { this.required = 0; return; }
    let req = this.grid[this.chain[0].r][this.chain[0].c];
    for (let i = 1; i < this.chain.length; i += 1) {
      const v = this.grid[this.chain[i].r][this.chain[i].c];
      if (v === req * 2) req = v;
    }
    this.required = req;
  }

  private extend(cell: Cell) {
    if (!this.chain.length) {
      this.chain = [cell];
      this.required = this.grid[cell.r][cell.c];
      return;
    }
    // Backtrack: swiping onto the previous cell drops the last one.
    if (this.chain.length >= 2) {
      const prev = this.chain[this.chain.length - 2];
      if (prev.c === cell.c && prev.r === cell.r) { this.chain.pop(); this.recompute(); return; }
    }
    if (this.inChain(cell)) return;
    const last = this.chain[this.chain.length - 1];
    if (!adjacent(last, cell)) return;
    const v = this.grid[cell.r][cell.c];
    // Next block must match the current level, or be its immediate double.
    if (v === this.required || v === this.required * 2) {
      this.chain.push(cell);
      if (v === this.required * 2) this.required = v;
    }
  }

  private onDown = (event: PointerEvent) => {
    if (this.status !== 'playing') return;
    const cell = this.cellAt(event.clientX, event.clientY);
    if (!cell) return;
    this.dragging = true;
    this.chain = [];
    this.extend(cell);
  };

  private onMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    const cell = this.cellAt(event.clientX, event.clientY);
    if (cell) this.extend(cell);
  };

  private onUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.commit();
  };

  // ---- merging -----------------------------------------------------------

  private commit() {
    if (this.chain.length < 2) { this.chain = []; return; }
    const sum = this.chain.reduce((total, cell) => total + this.grid[cell.r][cell.c], 0);
    const result = this.required * 2;
    this.score += sum;
    // The whole chain clears; the block you finished on becomes the merged value.
    this.chain.forEach((cell, i) => {
      this.grid[cell.r][cell.c] = i === this.chain.length - 1 ? result : 0;
    });
    this.options.onScore(sum);
    this.chain = [];
    this.applyGravity();
    this.best = Math.max(this.best, this.score);
    if (!hasMove(this.grid)) this.status = 'over';
  }

  /** Everything falls; empty spaces refill from the top. */
  private applyGravity() {
    for (let c = 0; c < COLS; c += 1) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r -= 1) {
        if (this.grid[r][c]) {
          if (write !== r) {
            this.grid[write][c] = this.grid[r][c];
            this.grid[r][c] = 0;
            this.fall[write][c] = this.cellY(r) - this.cellY(write); // slides down from old spot
          }
          write -= 1;
        }
      }
      for (let r = write; r >= 0; r -= 1) {
        this.grid[r][c] = spawnValue();
        this.fall[r][c] = -this.cellY(r) - CELL; // drops in from above the board
      }
    }
  }

  // ---- drawing -----------------------------------------------------------

  private roundRect(x: number, y: number, w: number, h: number, radius: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  private draw(dt: number) {
    const { ctx } = this;
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        // Empty slot backing.
        ctx.fillStyle = SLOT_BG;
        this.roundRect(this.cellX(c), this.cellY(r), CELL, CELL, 9);
        ctx.fill();

        const value = this.grid[r][c];
        if (!value) continue;
        // Ease the fall offset toward rest.
        this.fall[r][c] += (0 - this.fall[r][c]) * Math.min(1, dt * 13);
        if (Math.abs(this.fall[r][c]) < 0.4) this.fall[r][c] = 0;

        const x = this.cellX(c);
        const y = this.cellY(r) + this.fall[r][c];
        const [bg, fg] = colourFor(value);
        const lit = this.inChain({ c, r });
        ctx.fillStyle = bg;
        this.roundRect(x, y, CELL, CELL, 9);
        ctx.fill();
        if (lit) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          this.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 8);
          ctx.stroke();
        }
        ctx.fillStyle = fg;
        ctx.font = `700 ${value >= 1000 ? 22 : value >= 100 ? 26 : 30}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(value), x + CELL / 2, y + CELL / 2 + 1);
      }
    }

    // The chain line linking the selected blocks.
    if (this.chain.length > 1) {
      ctx.strokeStyle = '#3aa0ffcc';
      ctx.lineWidth = 9;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.chain.forEach((cell, i) => {
        const p = this.worldCenter(cell.c, cell.r);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
  }

  private snapshot(): ConnectorSnapshot {
    const sum = this.chain.reduce((total, cell) => total + this.grid[cell.r][cell.c], 0);
    return {
      score: this.score, best: Math.max(this.best, this.score),
      chain: this.chain.length,
      chainSum: sum,
      chainResult: this.chain.length >= 2 ? this.required * 2 : 0,
      status: this.status,
    };
  }

  dispose() {
    this.running = false;
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.draw(dt);
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
