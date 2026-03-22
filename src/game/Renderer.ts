import { Tile, GameState, Direction, CellAnim } from './types';

const TILE_SIZE = 32;

// Color palette
const COLORS: Record<number, string> = {
  [Tile.EMPTY]: '#1a1a2e',
  [Tile.DIRT]: '#8B6914',
  [Tile.WALL]: '#555577',
  [Tile.BOULDER]: '#888899',
  [Tile.DIAMOND]: '#00eeff',
  [Tile.PLAYER]: '#ff6600',
  [Tile.EXIT]: '#00ff88',
  [Tile.SPIDER]: '#cc00ff',
  [Tile.MONSTER]: '#ff0044',
  [Tile.WATER]: '#2244ff',
  [Tile.STEEL]: '#334455',
  [Tile.EXPLOSION]: '#ff8800',
};

const DIRT_DETAIL = '#6B5210';
const WALL_HIGHLIGHT = '#7777aa';
const WALL_SHADOW = '#333355';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private cameraX = 0;
  private cameraY = 0;
  private targetCameraX = 0;
  private targetCameraY = 0;
  private time = 0;
  private tileSize = TILE_SIZE;

  // Glow effects
  private diamondGlow = 0;
  private exitPulse = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    // Leave room for HUD at top and controls at bottom
    const hudH = 40;
    const controlH = 160;
    const availW = window.innerWidth;
    const availH = window.innerHeight - hudH - controlH;

    this.width = availW;
    this.height = availH + hudH; // canvas covers HUD area too for rendering

    this.canvas.style.width = `${availW}px`;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.style.marginTop = `${hudH}px`;
    this.canvas.width = Math.floor(availW * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Calculate tile size to fit well on screen
    this.tileSize = Math.max(16, Math.min(40, Math.floor(Math.min(availW, availH) / 14)));
  }

  render(state: GameState, dt: number) {
    this.time += dt;
    this.diamondGlow = 0.5 + 0.5 * Math.sin(this.time * 0.004);
    this.exitPulse = 0.5 + 0.5 * Math.sin(this.time * 0.006);

    const ctx = this.ctx;
    const ts = this.tileSize;

    // Camera target: center on player
    this.targetCameraX = state.playerCol * ts - this.width / 2 + ts / 2;
    this.targetCameraY = state.playerRow * ts - (this.height) / 2 + ts / 2;

    // Clamp camera
    const mapW = state.cols * ts;
    const mapH = state.rows * ts;
    this.targetCameraX = Math.max(0, Math.min(this.targetCameraX, mapW - this.width));
    this.targetCameraY = Math.max(0, Math.min(this.targetCameraY, mapH - this.height));

    // Smooth camera lerp
    const lerpSpeed = 1 - Math.pow(0.001, dt / 16);
    this.cameraX += (this.targetCameraX - this.cameraX) * lerpSpeed;
    this.cameraY += (this.targetCameraY - this.cameraY) * lerpSpeed;

    // Screen shake
    let shakeX = 0, shakeY = 0;
    if (state.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * state.screenShake * 2;
      shakeY = (Math.random() - 0.5) * state.screenShake * 2;
    }

    ctx.save();
    ctx.translate(-this.cameraX + shakeX, -this.cameraY + shakeY);

    // Clear
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(this.cameraX - 10, this.cameraY - 10, this.width + 20, this.height + 20);

    // Determine visible tile range
    const startCol = Math.max(0, Math.floor(this.cameraX / ts) - 1);
    const endCol = Math.min(state.cols, Math.ceil((this.cameraX + this.width) / ts) + 1);
    const startRow = Math.max(0, Math.floor(this.cameraY / ts) - 1);
    const endRow = Math.min(state.rows, Math.ceil((this.cameraY + this.height) / ts) + 1);

    // Render tiles
    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const tile = state.map[r][c];
        const x = c * ts;
        const y = r * ts;

        // Check for animation offset
        const animKey = `${r},${c}`;
        const anim = state.animations.get(animKey);

        if (anim && anim.progress < 1) {
          // Draw empty behind animated tile
          ctx.fillStyle = COLORS[Tile.EMPTY];
          ctx.fillRect(x, y, ts, ts);
          // Draw animated tile at interpolated position
          const ease = easeOutCubic(anim.progress);
          const ax = anim.fromCol * ts + (anim.toCol - anim.fromCol) * ts * ease;
          const ay = anim.fromRow * ts + (anim.toRow - anim.fromRow) * ts * ease;
          this.drawTile(ctx, tile, ax, ay, ts, r, c);
        } else {
          this.drawTile(ctx, tile, x, y, ts, r, c);
        }
      }
    }

    // Draw player
    this.drawPlayer(ctx, state, ts);

    // Draw particles
    this.drawParticles(ctx, state, ts);

    ctx.restore();
  }

  private drawTile(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, ts: number, r: number, c: number) {
    const pad = 0.5;

    switch (tile) {
      case Tile.EMPTY:
        ctx.fillStyle = COLORS[Tile.EMPTY];
        ctx.fillRect(x, y, ts, ts);
        break;

      case Tile.DIRT:
        ctx.fillStyle = COLORS[Tile.DIRT];
        ctx.fillRect(x, y, ts, ts);
        // Texture detail
        ctx.fillStyle = DIRT_DETAIL;
        const seed = (r * 173 + c * 337) % 7;
        ctx.fillRect(x + 3 + seed, y + 4, 3, 2);
        ctx.fillRect(x + ts - 8 + seed % 3, y + ts - 6, 2, 2);
        ctx.fillRect(x + 6, y + ts / 2 + seed % 4, 2, 3);
        // Edge darkening
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(x, y + ts - 1, ts, 1);
        ctx.fillRect(x + ts - 1, y, 1, ts);
        break;

      case Tile.WALL:
        // Brick pattern
        ctx.fillStyle = COLORS[Tile.WALL];
        ctx.fillRect(x, y, ts, ts);
        ctx.fillStyle = WALL_HIGHLIGHT;
        ctx.fillRect(x, y, ts, 1);
        ctx.fillRect(x, y, 1, ts);
        ctx.fillStyle = WALL_SHADOW;
        ctx.fillRect(x, y + ts - 1, ts, 1);
        ctx.fillRect(x + ts - 1, y, 1, ts);
        // Brick lines
        ctx.fillStyle = WALL_SHADOW;
        ctx.fillRect(x, y + ts / 2 - pad, ts, 1);
        const brickOffset = (r % 2) * (ts / 2);
        ctx.fillRect(x + brickOffset + ts / 4, y, 1, ts / 2);
        ctx.fillRect(x + brickOffset + ts * 3 / 4, y + ts / 2, 1, ts / 2);
        break;

      case Tile.STEEL:
        ctx.fillStyle = COLORS[Tile.STEEL];
        ctx.fillRect(x, y, ts, ts);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 1, y + 1, ts - 2, 1);
        ctx.fillRect(x + 1, y + 1, 1, ts - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x, y + ts - 1, ts, 1);
        ctx.fillRect(x + ts - 1, y, 1, ts);
        break;

      case Tile.BOULDER:
        ctx.fillStyle = COLORS[Tile.EMPTY];
        ctx.fillRect(x, y, ts, ts);
        // Rock with 3D shading
        const rx = x + ts / 2;
        const ry = y + ts / 2;
        const rr = ts * 0.4;
        const grad = ctx.createRadialGradient(rx - rr * 0.3, ry - rr * 0.3, rr * 0.1, rx, ry, rr);
        grad.addColorStop(0, '#bbbbcc');
        grad.addColorStop(0.7, '#888899');
        grad.addColorStop(1, '#555566');
        ctx.beginPath();
        ctx.arc(rx, ry, rr, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // Highlight
        ctx.beginPath();
        ctx.arc(rx - rr * 0.25, ry - rr * 0.25, rr * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
        break;

      case Tile.DIAMOND: {
        ctx.fillStyle = COLORS[Tile.EMPTY];
        ctx.fillRect(x, y, ts, ts);
        const dx = x + ts / 2;
        const dy = y + ts / 2;
        const ds = ts * 0.35;

        // Each diamond has a unique phase based on grid position
        const seed = (r * 7919 + c * 6271) % 10000;
        const phase = seed / 10000;

        // Ambient glow (always on, gentle pulse)
        const glowR = ds * (1.3 + this.diamondGlow * 0.4);
        const glow = ctx.createRadialGradient(dx, dy, 0, dx, dy, glowR);
        glow.addColorStop(0, 'rgba(0,238,255,0.35)');
        glow.addColorStop(1, 'rgba(0,238,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, ts, ts);

        // Random glare — subtle glint on a facet edge
        const glareInterval = 2500 + phase * 3500; // 2.5–6s between glints
        const glareCycle = ((this.time + phase * 8000) % glareInterval) / glareInterval;
        const glareRaw = glareCycle < 0.08 ? Math.sin(glareCycle / 0.08 * Math.PI) : 0;
        const glareIntensity = glareRaw * glareRaw;

        // Diamond shape (unchanged colors — no full brightening)
        ctx.beginPath();
        ctx.moveTo(dx, dy - ds);
        ctx.lineTo(dx + ds, dy);
        ctx.lineTo(dx, dy + ds);
        ctx.lineTo(dx - ds, dy);
        ctx.closePath();
        const dGrad = ctx.createLinearGradient(dx - ds, dy - ds, dx + ds, dy + ds);
        dGrad.addColorStop(0, '#88ffff');
        dGrad.addColorStop(0.5, '#00eeff');
        dGrad.addColorStop(1, '#0088cc');
        ctx.fillStyle = dGrad;
        ctx.fill();

        // Tiny star glint on upper-right facet edge
        if (glareIntensity > 0.05) {
          const glintX = dx + ds * 0.35;
          const glintY = dy - ds * 0.35;
          const starSize = ts * (0.04 + glareIntensity * 0.12);
          ctx.save();
          ctx.globalAlpha = glareIntensity * 0.9;
          ctx.fillStyle = '#ffffff';
          // Small cross
          ctx.fillRect(glintX - starSize, glintY - 0.5, starSize * 2, 1);
          ctx.fillRect(glintX - 0.5, glintY - starSize, 1, starSize * 2);
          ctx.restore();
        }

        // Small constant sparkle at top facet
        ctx.fillStyle = `rgba(255,255,255,${0.5 + this.diamondGlow * 0.5})`;
        const sparkleSize = 2 + this.diamondGlow;
        ctx.fillRect(dx - sparkleSize / 2, dy - ds * 0.5 - sparkleSize / 2, sparkleSize, sparkleSize);
        break;
      }

      case Tile.EXIT: {
        ctx.fillStyle = COLORS[Tile.EMPTY];
        ctx.fillRect(x, y, ts, ts);
        const ex = x + ts / 2;
        const ey = y + ts / 2;
        if (this.exitPulse !== undefined) {
          // Pulsing glow when open
          const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, ts * 0.6);
          eg.addColorStop(0, `rgba(0,255,136,${0.3 + this.exitPulse * 0.2})`);
          eg.addColorStop(1, 'rgba(0,255,136,0)');
          ctx.fillStyle = eg;
          ctx.fillRect(x, y, ts, ts);
        }
        // Door frame
        ctx.fillStyle = '#446644';
        ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
        ctx.fillStyle = COLORS[Tile.EXIT];
        ctx.fillRect(x + 4, y + 4, ts - 8, ts - 8);
        // Arrow
        ctx.fillStyle = '#003322';
        const ax = x + ts / 2;
        const ay = y + ts / 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay - 4);
        ctx.lineTo(ax + 5, ay + 2);
        ctx.lineTo(ax - 5, ay + 2);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case Tile.SPIDER: {
        ctx.fillStyle = COLORS[Tile.EMPTY];
        ctx.fillRect(x, y, ts, ts);
        const sx = x + ts / 2;
        const sy = y + ts / 2;
        // Body
        ctx.beginPath();
        ctx.arc(sx, sy, ts * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[Tile.SPIDER];
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(sx - 4, sy - 3, 3, 3);
        ctx.fillRect(sx + 1, sy - 3, 3, 3);
        // Legs
        ctx.strokeStyle = COLORS[Tile.SPIDER];
        ctx.lineWidth = 1.5;
        const legAng = Math.sin(this.time * 0.01) * 0.3;
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 + legAng;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(angle) * ts * 0.45, sy + Math.sin(angle) * ts * 0.45);
          ctx.stroke();
        }
        break;
      }

      case Tile.MONSTER: {
        ctx.fillStyle = COLORS[Tile.EMPTY];
        ctx.fillRect(x, y, ts, ts);
        const mx = x + ts / 2;
        const my = y + ts / 2;
        // Body
        const bounce = Math.sin(this.time * 0.008) * 2;
        ctx.fillStyle = COLORS[Tile.MONSTER];
        ctx.fillRect(mx - ts * 0.35, my - ts * 0.3 + bounce, ts * 0.7, ts * 0.5);
        // Teeth
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(mx - ts * 0.25 + i * 5, my + ts * 0.15 + bounce, 3, 3);
        }
        // Eyes
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(mx - 4, my - ts * 0.1 + bounce, 3, 0, Math.PI * 2);
        ctx.arc(mx + 4, my - ts * 0.1 + bounce, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case Tile.WATER: {
        const waveOff = Math.sin(this.time * 0.003 + c * 0.5) * 2;
        ctx.fillStyle = '#1133aa';
        ctx.fillRect(x, y, ts, ts);
        ctx.fillStyle = 'rgba(100,180,255,0.3)';
        ctx.fillRect(x, y + ts / 3 + waveOff, ts, 2);
        ctx.fillRect(x, y + ts * 2 / 3 - waveOff, ts, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + 3, y + 2 + waveOff, 6, 1);
        break;
      }

      case Tile.EXPLOSION: {
        ctx.fillStyle = COLORS[Tile.EMPTY];
        ctx.fillRect(x, y, ts, ts);
        const ep = ctx.createRadialGradient(x + ts / 2, y + ts / 2, 0, x + ts / 2, y + ts / 2, ts * 0.5);
        ep.addColorStop(0, '#ffffff');
        ep.addColorStop(0.3, '#ffaa00');
        ep.addColorStop(0.7, '#ff4400');
        ep.addColorStop(1, 'rgba(255,68,0,0)');
        ctx.fillStyle = ep;
        ctx.fillRect(x, y, ts, ts);
        break;
      }

      default:
        ctx.fillStyle = COLORS[tile] || '#ff00ff';
        ctx.fillRect(x, y, ts, ts);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, ts: number) {
    // Draw death animation if dead
    if (!state.alive) {
      this.drawDeathAnim(ctx, state, ts);
      return;
    }

    let x = state.playerCol * ts;
    let y = state.playerRow * ts;

    // Check for movement animation
    const animKey = `${state.playerRow},${state.playerCol}`;
    const anim = state.animations.get(animKey);
    if (anim && anim.progress < 1) {
      const ease = easeOutCubic(anim.progress);
      x = anim.fromCol * ts + (anim.toCol - anim.fromCol) * ts * ease;
      y = anim.fromRow * ts + (anim.toRow - anim.fromRow) * ts * ease;
    }

    this.drawPlayerBody(ctx, x, y, ts, 1, 1, state.playerDir, state.playerMoving, 1);
  }

  private drawPlayerBody(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, ts: number,
    scaleX: number, scaleY: number,
    dir: Direction, moving: boolean, alpha: number,
  ) {
    const cx = x + ts / 2;
    const cy = y + ts / 2;

    let sx = scaleX, sy = scaleY;
    if (moving && sx === 1 && sy === 1) {
      const stretch = Math.sin(this.time * 0.02) * 0.08;
      if (dir === Direction.UP || dir === Direction.DOWN) {
        sx = 1 - stretch;
        sy = 1 + stretch;
      } else {
        sx = 1 + stretch;
        sy = 1 - stretch;
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);

    const u = ts / 32; // unit scale factor
    const eyeOff = this.getEyeOffset(dir);

    // -- Ninja body (dark outfit) --
    const bodyR = ts * 0.36;
    const bodyGrad = ctx.createRadialGradient(-bodyR * 0.2, bodyR * 0.1, bodyR * 0.05, 0, 0, bodyR);
    bodyGrad.addColorStop(0, '#3a3a4a');
    bodyGrad.addColorStop(1, '#1a1a2a');
    ctx.beginPath();
    ctx.arc(0, u * 2, bodyR, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // -- Head --
    const headR = ts * 0.3;
    const headGrad = ctx.createRadialGradient(-headR * 0.15, -headR * 0.6, headR * 0.05, 0, -headR * 0.35, headR);
    headGrad.addColorStop(0, '#444455');
    headGrad.addColorStop(1, '#222233');
    ctx.beginPath();
    ctx.arc(0, -u * 3, headR, 0, Math.PI * 2);
    ctx.fillStyle = headGrad;
    ctx.fill();

    // -- Mask / headband (red) --
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(-headR * 0.95, -u * 5.5, headR * 1.9, u * 3.2);
    // Headband tails fluttering based on direction
    const tailWave = Math.sin(this.time * 0.012) * u * 1.5;
    const tailDir = dir === Direction.LEFT ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(headR * 0.85 * tailDir, -u * 5);
    ctx.quadraticCurveTo(
      headR * 1.4 * tailDir + tailWave, -u * 6 + tailWave,
      headR * 1.8 * tailDir + tailWave * 1.5, -u * 5.5 + tailWave
    );
    ctx.lineTo(headR * 1.6 * tailDir + tailWave * 1.2, -u * 3.5 + tailWave * 0.5);
    ctx.quadraticCurveTo(
      headR * 1.2 * tailDir + tailWave * 0.5, -u * 3,
      headR * 0.85 * tailDir, -u * 2.5
    );
    ctx.fillStyle = '#cc2222';
    ctx.fill();
    // Second shorter tail
    ctx.beginPath();
    ctx.moveTo(headR * 0.7 * tailDir, -u * 4.5);
    ctx.quadraticCurveTo(
      headR * 1.1 * tailDir + tailWave * 0.8, -u * 5.5 + tailWave * 0.6,
      headR * 1.4 * tailDir + tailWave, -u * 4.5 + tailWave * 0.8
    );
    ctx.lineTo(headR * 1.2 * tailDir + tailWave * 0.6, -u * 3 + tailWave * 0.3);
    ctx.quadraticCurveTo(
      headR * 0.9 * tailDir, -u * 2.8,
      headR * 0.7 * tailDir, -u * 2.5
    );
    ctx.fillStyle = '#aa1818';
    ctx.fill();

    // -- Eyes (intense, white with small bright pupils) --
    const eyeSpacing = u * 3.5;
    const eyeY = -u * 4;
    // White slit eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-eyeSpacing + eyeOff.x, eyeY + eyeOff.y, u * 3, u * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eyeSpacing + eyeOff.x, eyeY + eyeOff.y, u * 3, u * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Sharp pupils
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.ellipse(-eyeSpacing + eyeOff.x * 1.4, eyeY + eyeOff.y * 1.2, u * 1.5, u * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eyeSpacing + eyeOff.x * 1.4, eyeY + eyeOff.y * 1.2, u * 1.5, u * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tiny eye shine
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-eyeSpacing + eyeOff.x * 1.4 - u * 0.8, eyeY + eyeOff.y * 1.2 - u * 0.8, u, u);
    ctx.fillRect(eyeSpacing + eyeOff.x * 1.4 - u * 0.8, eyeY + eyeOff.y * 1.2 - u * 0.8, u, u);

    // -- Belt --
    ctx.fillStyle = '#555566';
    ctx.fillRect(-bodyR * 0.6, u * 1, bodyR * 1.2, u * 1.8);
    // Belt buckle
    ctx.fillStyle = '#998844';
    ctx.fillRect(-u * 1.5, u * 1.2, u * 3, u * 1.4);

    // -- Arms (small nubs, direction-aware) --
    ctx.fillStyle = '#2a2a3a';
    const armY = u * 1;
    // Lead arm slightly forward in movement direction
    const armFwd = moving ? Math.sin(this.time * 0.025) * u * 2 : 0;
    ctx.beginPath();
    ctx.arc(-bodyR * 0.85 + eyeOff.x * 0.5 - armFwd, armY, u * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bodyR * 0.85 + eyeOff.x * 0.5 + armFwd, armY, u * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // -- Feet (slight run animation) --
    const footSpread = moving ? Math.sin(this.time * 0.025) * u * 2 : 0;
    ctx.fillStyle = '#222233';
    ctx.beginPath();
    ctx.ellipse(-u * 3 - footSpread, bodyR + u * 2, u * 2.5, u * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(u * 3 + footSpread, bodyR + u * 2, u * 2.5, u * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawDeathAnim(ctx: CanvasRenderingContext2D, state: GameState, ts: number) {
    const t = state.deathTimer;
    const x = state.deathCol * ts;
    const y = state.deathRow * ts;

    if (state.deathType === 'crush') {
      // CRUSH DEATH: Player gets squashed flat, then explodes
      if (t < 200) {
        // Phase 1: Squash — player flattens vertically, widens horizontally
        const progress = t / 200;
        const squashY = 1 - progress * 0.75;   // flatten to 25% height
        const squashX = 1 + progress * 0.6;     // widen to 160%
        // Shift down as they flatten
        const offsetY = progress * ts * 0.3;

        // Red flash overlay
        const flashAlpha = Math.sin(progress * Math.PI) * 0.4;
        ctx.save();
        ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
        ctx.fillRect(x - ts * 0.3, y - ts * 0.3, ts * 1.6, ts * 1.6);
        ctx.restore();

        this.drawPlayerBody(ctx, x, y + offsetY, ts, squashX, squashY, state.playerDir, false, 1);

        // Impact lines radiating outward
        ctx.save();
        ctx.strokeStyle = `rgba(255, 200, 50, ${1 - progress})`;
        ctx.lineWidth = 2;
        const cx = x + ts / 2;
        const cy = y + ts / 2;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const innerR = ts * 0.4 + progress * ts * 0.2;
          const outerR = innerR + progress * ts * 0.5;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
          ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
          ctx.stroke();
        }
        ctx.restore();

      } else if (t < 500) {
        // Phase 2: Explosion — flattened player fades + ring expands
        const progress = (t - 200) / 300;
        const fadeAlpha = 1 - progress;

        // Draw the squished player fading out
        if (fadeAlpha > 0.05) {
          this.drawPlayerBody(ctx, x, y + ts * 0.3, ts, 1.6, 0.25, state.playerDir, false, fadeAlpha);
        }

        // Expanding explosion ring
        const cx = x + ts / 2;
        const cy = y + ts / 2;
        const ringR = ts * 0.3 + progress * ts * 1.2;
        const ringAlpha = (1 - progress) * 0.7;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 100, 0, ${ringAlpha})`;
        ctx.lineWidth = 3 * (1 - progress) + 1;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();

        // Inner white flash
        if (progress < 0.3) {
          const flashR = ts * 0.5 * (1 - progress / 0.3);
          const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
          glow.addColorStop(0, `rgba(255,255,255,${0.6 * (1 - progress / 0.3)})`);
          glow.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

      } else if (t < 1200) {
        // Phase 3: Smoke lingers (particles handle this) + ghost silhouette
        const progress = (t - 500) / 700;
        const ghostAlpha = Math.max(0, 0.2 * (1 - progress));
        if (ghostAlpha > 0.01) {
          this.drawPlayerBody(ctx, x, y, ts, 1, 1, state.playerDir, false, ghostAlpha);
        }
      }

    } else if (state.deathType === 'enemy') {
      // ENEMY DEATH: Flash red, expand, fade
      if (t < 150) {
        const progress = t / 150;
        const scale = 1 + progress * 0.3;
        // Red tint flash
        this.drawPlayerBody(ctx, x, y, ts, scale, scale, state.playerDir, false, 1);
        ctx.save();
        ctx.fillStyle = `rgba(255, 0, 50, ${0.5 * Math.sin(progress * Math.PI)})`;
        ctx.beginPath();
        ctx.arc(x + ts / 2, y + ts / 2, ts * 0.5 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (t < 600) {
        const progress = (t - 150) / 450;
        const alpha = 1 - progress;
        const scale = 1.3 + progress * 0.5;
        if (alpha > 0.05) {
          this.drawPlayerBody(ctx, x, y, ts, scale, scale, state.playerDir, false, alpha);
        }
      }

    } else {
      // TIME DEATH: Fade out with blink
      if (t < 800) {
        const blink = Math.sin(t * 0.03) > 0 ? 1 : 0.2;
        this.drawPlayerBody(ctx, x, y, ts, 1, 1, state.playerDir, false, blink);
      } else if (t < 1500) {
        const progress = (t - 800) / 700;
        this.drawPlayerBody(ctx, x, y, ts, 1 - progress * 0.5, 1 - progress * 0.5, state.playerDir, false, 1 - progress);
      }
    }
  }

  private getEyeOffset(dir: Direction): { x: number; y: number } {
    switch (dir) {
      case Direction.UP: return { x: 0, y: -2 };
      case Direction.DOWN: return { x: 0, y: 2 };
      case Direction.LEFT: return { x: -2, y: 0 };
      case Direction.RIGHT: return { x: 2, y: 0 };
      default: return { x: 0, y: 0 };
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, state: GameState, ts: number) {
    for (const p of state.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const px = p.x * ts + ts / 2;
      const py = p.y * ts + ts / 2;
      ctx.fillRect(px - p.size / 2, py - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
