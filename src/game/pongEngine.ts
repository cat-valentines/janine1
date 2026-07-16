import {
  BALL_R, FLOOR_Y, GRAVITY, NET_H, NET_X, PLAYER_SPEED, REACH, SWING_MS,
  TABLE_X1, TABLE_X2, TABLE_Y, VIEW_H, VIEW_W, WIN_SCORE, type PongMode,
} from './pong';

export interface PongSnapshot {
  mode: PongMode;
  /** Solo: hits in a row. Rally: hits this point. */
  rally: number;
  best: number;
  you: number;
  them: number;
  status: 'serve' | 'playing' | 'point' | 'over';
  message: string;
  winner: '' | 'you' | 'them';
}

interface Player {
  x: number;
  swingUntil: number;
  side: -1 | 1;
  colour: string;
  face: string;
  name: string;
}

interface EngineOptions {
  myName?: string;
  mode: PongMode;
  best: number;
  characterAsset: string;
  onUpdate: (snapshot: PongSnapshot) => void;
}

export class PongEngine {
  private ctx: CanvasRenderingContext2D;
  private options: EngineOptions;
  private mode: PongMode;
  private sprite = new Image();

  private ball = { x: 240, y: 120, vx: 0, vy: 0 };
  private you: Player = { x: 220, swingUntil: 0, side: 1, colour: '#4a7fb5', face: '🙂', name: 'You' };
  private them: Player = { x: 740, swingUntil: 0, side: -1, colour: '#b06a5a', face: '🤖', name: 'Bot' };

  private rally = 0;
  private best = 0;
  private scoreYou = 0;
  private scoreThem = 0;
  private status: PongSnapshot['status'] = 'serve';
  private message = '';
  private messageUntil = 0;
  private winner: '' | 'you' | 'them' = '';
  /** Who touched it last, so we know whose fault a miss is. */
  private lastHit: 'you' | 'them' | '' = '';
  private bouncedSince = 0;

  private keys = new Set<string>();
  private running = true;
  private last = 0;
  private time = 0;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.options = options;
    this.mode = options.mode;
    this.best = options.best;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.sprite.src = options.characterAsset;
    this.you.name = options.myName || 'You';
    if (this.mode === 'friend') { this.them.face = '🙃'; this.them.name = 'Player 2'; }
    this.serve();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD'].includes(event.code)) event.preventDefault();
    if (this.keys.has(event.code)) return; // ignore auto-repeat
    this.keys.add(event.code);
    if (event.code === 'Space') this.swing(this.mode === 'friend' ? this.them : this.you);
    if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && this.mode === 'friend') this.swing(this.you);
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private say(text: string, seconds = 1.6) {
    this.message = text;
    this.messageUntil = this.time + seconds;
  }

  /** The racket sits just in front of the player, at hitting height. */
  private racketY() { return TABLE_Y - 46; }

  private swing(player: Player) {
    if (this.status === 'over') return;
    if (this.status === 'serve') this.status = 'playing';
    player.swingUntil = this.time + SWING_MS / 1000;

    const dx = this.ball.x - player.x;
    const dy = this.ball.y - this.racketY();
    if (Math.hypot(dx, dy) > REACH) return;

    if (this.mode === 'solo') {
      // Keepy-uppy: knock it straight back up, drifting where you hit it.
      this.ball.vy = -430;
      this.ball.vx = dx * 3.4;
      this.rally += 1;
      this.best = Math.max(this.best, this.rally);
      this.bouncedSince = 0;
      return;
    }
    // Send it over the net. Hitting early/late angles the shot.
    const who = player === this.you ? 'you' : 'them';
    if (this.lastHit === who && this.bouncedSince === 0) return; // cannot hit twice in a row
    this.ball.vx = player.side * (300 + Math.abs(dx) * 2.2);
    this.ball.vy = -300 - Math.random() * 40;
    this.lastHit = who;
    this.rally += 1;
    this.best = Math.max(this.best, this.rally);
    this.bouncedSince = 0;
  }

  private serve() {
    this.status = 'serve';
    this.rally = 0;
    this.lastHit = '';
    this.bouncedSince = 0;
    if (this.mode === 'solo') {
      this.ball = { x: this.you.x, y: 90, vx: 0, vy: 0 };
      this.say('Press Space to keep it up!', 2.4);
      return;
    }
    this.ball = { x: this.you.x + 30, y: 150, vx: 60, vy: 0 };
    this.say('Press Space to serve', 2);
  }

  private point(to: 'you' | 'them', why: string) {
    if (this.status !== 'playing' && this.status !== 'serve') return;
    if (to === 'you') this.scoreYou += 1; else this.scoreThem += 1;
    this.status = 'point';
    this.say(why, 2);
    if (this.scoreYou >= WIN_SCORE || this.scoreThem >= WIN_SCORE) {
      this.status = 'over';
      this.winner = this.scoreYou > this.scoreThem ? 'you' : 'them';
      return;
    }
    setTimeout(() => { if (this.running) this.serve(); }, 1100);
  }

  private moveBot(dt: number) {
    // The bot tracks the ball, but only once it is on their half.
    const target = this.ball.vx > 0 ? this.ball.x + this.ball.vx * 0.18 : NET_X + 160;
    const want = Math.max(NET_X + 40, Math.min(TABLE_X2 - 20, target));
    const diff = want - this.them.x;
    // Deliberately a bit slower than a player, so it is beatable.
    this.them.x += Math.max(-1, Math.min(1, diff / 40)) * PLAYER_SPEED * 0.82 * dt;
    if (Math.abs(this.ball.x - this.them.x) < REACH * 0.8 && this.ball.vx > 0 && this.time > this.them.swingUntil) {
      this.swing(this.them);
    }
  }

  private update(dt: number) {
    // Player movement.
    const leftKey = this.mode === 'friend' ? 'KeyA' : 'ArrowLeft';
    const rightKey = this.mode === 'friend' ? 'KeyD' : 'ArrowRight';
    const move = (this.keys.has(rightKey) ? 1 : 0) - (this.keys.has(leftKey) ? 1 : 0);
    const youMax = this.mode === 'solo' ? TABLE_X2 - 20 : NET_X - 30;
    this.you.x = Math.max(TABLE_X1 + 20, Math.min(youMax, this.you.x + move * PLAYER_SPEED * dt));

    if (this.mode === 'bot') this.moveBot(dt);
    if (this.mode === 'friend') {
      const move2 = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
      this.them.x = Math.max(NET_X + 30, Math.min(TABLE_X2 - 20, this.them.x + move2 * PLAYER_SPEED * dt));
    }

    if (this.status === 'serve') {
      // The ball waits politely above the server's racket.
      if (this.mode === 'solo') this.ball.x = this.you.x;
      else this.ball.x = this.you.x + 30;
      this.ball.y = this.mode === 'solo' ? 90 : 150;
      return;
    }
    if (this.status !== 'playing') return;

    this.ball.vy += GRAVITY * dt;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    // Side walls keep it in view.
    if (this.ball.x < BALL_R) { this.ball.x = BALL_R; this.ball.vx = Math.abs(this.ball.vx); }
    if (this.ball.x > VIEW_W - BALL_R) { this.ball.x = VIEW_W - BALL_R; this.ball.vx = -Math.abs(this.ball.vx); }

    const onTable = this.ball.x > TABLE_X1 && this.ball.x < TABLE_X2;

    if (this.mode === 'solo') {
      // Bounce off the table, but a bounce does not count as a hit.
      if (onTable && this.ball.y > TABLE_Y - BALL_R && this.ball.vy > 0) {
        this.ball.y = TABLE_Y - BALL_R;
        this.ball.vy *= -0.62;
        this.bouncedSince += 1;
        if (this.bouncedSince > 2) { this.dropped(); return; }
      }
      if (this.ball.y > FLOOR_Y) this.dropped();
      return;
    }

    // The net.
    if (Math.abs(this.ball.x - NET_X) < 4 && this.ball.y > TABLE_Y - NET_H) {
      this.ball.vx *= -0.35;
      this.ball.x += this.ball.vx > 0 ? 5 : -5;
      this.say('🪀 Net!', 1);
    }
    // Table bounce.
    if (onTable && this.ball.y > TABLE_Y - BALL_R && this.ball.vy > 0) {
      this.ball.y = TABLE_Y - BALL_R;
      this.ball.vy *= -0.72;
      this.bouncedSince += 1;
      // Two bounces on your own side means the other player scores.
      if (this.bouncedSince >= 2) {
        const side = this.ball.x < NET_X ? 'you' : 'them';
        this.point(side === 'you' ? 'them' : 'you', side === 'you' ? 'You missed it!' : 'Point to you!');
      }
      return;
    }
    // Missed the table entirely.
    if (this.ball.y > FLOOR_Y) {
      if (!onTable) {
        const hitter = this.lastHit;
        if (hitter === 'you') this.point('them', 'Out! That was long.');
        else if (hitter === 'them') this.point('you', 'They hit it out — point to you!');
        else this.point('them', 'Out!');
      } else {
        const side = this.ball.x < NET_X ? 'you' : 'them';
        this.point(side === 'you' ? 'them' : 'you', side === 'you' ? 'You missed it!' : 'Point to you!');
      }
    }
  }

  private dropped() {
    this.status = 'over';
    this.winner = '';
    this.say(`You kept it up ${this.rally} times!`, 4);
  }

  // ---- drawing -----------------------------------------------------------

  private drawPlayer(player: Player, isYou: boolean) {
    const { ctx } = this;
    const swinging = this.time < player.swingUntil;
    const x = player.x;
    const footY = TABLE_Y + 66;

    // Body.
    ctx.fillStyle = player.colour;
    ctx.fillRect(x - 11, footY - 62, 22, 34);
    ctx.fillStyle = '#3c4a63';
    ctx.fillRect(x - 9, footY - 28, 7, 28);
    ctx.fillRect(x + 2, footY - 28, 7, 28);
    // Head: your own character's face, or an emoji for the opponent.
    if (isYou && this.sprite.complete && this.sprite.naturalWidth) {
      ctx.drawImage(this.sprite, x - 15, footY - 96, 30, 30);
    } else {
      ctx.font = '26px serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.face, x, footY - 70);
    }
    // Username above the head, so you know who is who.
    if (player.name) {
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(player.name).width + 12;
      ctx.fillStyle = '#16241cd0';
      ctx.fillRect(x - w / 2, footY - 122, w, 18);
      ctx.fillStyle = isYou ? '#7dffbe' : '#ffd9a0';
      ctx.fillText(player.name, x, footY - 109);
    }
    // Racket, swung forward when hitting.
    const reach = swinging ? 34 : 20;
    const ry = swinging ? this.racketY() - 6 : this.racketY() + 6;
    ctx.strokeStyle = '#8a6642';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + player.side * 8, footY - 52);
    ctx.lineTo(x + player.side * reach, ry + 10);
    ctx.stroke();
    ctx.fillStyle = swinging ? '#e8503a' : '#c0392b';
    ctx.beginPath();
    ctx.ellipse(x + player.side * reach, ry, 13, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private draw() {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, '#bfe4f2');
    sky.addColorStop(1, '#e8f2e0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Floor.
    ctx.fillStyle = '#c9b99a';
    ctx.fillRect(0, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y);

    // Table.
    ctx.fillStyle = '#2f6b45';
    ctx.fillRect(TABLE_X1, TABLE_Y, TABLE_X2 - TABLE_X1, 12);
    ctx.fillStyle = '#245235';
    ctx.fillRect(TABLE_X1, TABLE_Y + 12, TABLE_X2 - TABLE_X1, 5);
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(TABLE_X1, TABLE_Y, TABLE_X2 - TABLE_X1, 2);
    // Legs.
    ctx.fillStyle = '#5f4830';
    ctx.fillRect(TABLE_X1 + 14, TABLE_Y + 17, 8, FLOOR_Y - TABLE_Y - 17);
    ctx.fillRect(TABLE_X2 - 22, TABLE_Y + 17, 8, FLOOR_Y - TABLE_Y - 17);

    if (this.mode !== 'solo') {
      // Net.
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(NET_X - 2, TABLE_Y - NET_H, 4, NET_H);
      ctx.strokeStyle = '#e8e0d5';
      ctx.lineWidth = 1;
      for (let y = TABLE_Y - NET_H; y < TABLE_Y; y += 6) {
        ctx.beginPath(); ctx.moveTo(NET_X - 2, y); ctx.lineTo(NET_X + 2, y); ctx.stroke();
      }
    }

    this.drawPlayer(this.you, true);
    if (this.mode !== 'solo') this.drawPlayer(this.them, false);

    // Ball.
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8ad2f';
    ctx.beginPath();
    ctx.arc(this.ball.x + 2, this.ball.y + 2, BALL_R * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private snapshot(): PongSnapshot {
    return {
      mode: this.mode,
      rally: this.rally,
      best: this.best,
      you: this.scoreYou,
      them: this.scoreThem,
      status: this.status,
      message: this.time < this.messageUntil ? this.message : '',
      winner: this.winner,
    };
  }

  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.03);
    this.last = now;
    this.time += dt;
    if (this.status !== 'over') this.update(dt);
    this.draw();
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
