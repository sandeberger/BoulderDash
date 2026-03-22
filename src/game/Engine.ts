import { Tile, GameState, Direction, CellAnim, Particle, Pos } from './types';
import { LEVELS } from './levels';

const MOVE_SPEED = 8; // ticks between player moves
const ROCK_SPEED = 6;
const ENEMY_SPEED = 10;
const ANIM_DURATION = 120; // ms for movement animation

export class Engine {
  state!: GameState;
  private moveTick = 0;
  private rockTick = 0;
  private enemyTick = 0;
  private inputQueue: Direction = Direction.NONE;
  private inputHeld: Direction = Direction.NONE;
  private tickCount = 0;
  private fallingCells = new Set<string>(); // tracks cells with actively falling rocks/diamonds

  constructor() {
    this.loadLevel(0);
  }

  loadLevel(idx: number) {
    const level = LEVELS[idx] ?? LEVELS[0];
    const map: Tile[][] = [];
    let playerRow = 1, playerCol = 1;

    for (let r = 0; r < level.map.length; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < level.map[r].length; c++) {
        const ch = level.map[r][c];
        const tile = charToTile(ch);
        if (tile === Tile.PLAYER) {
          playerRow = r;
          playerCol = c;
          row.push(Tile.EMPTY);
        } else {
          row.push(tile);
        }
      }
      map.push(row);
    }

    this.state = {
      map,
      rows: map.length,
      cols: map[0].length,
      playerRow,
      playerCol,
      diamondsCollected: 0,
      diamondsNeeded: level.diamonds,
      score: this.state?.score ?? 0,
      lives: this.state?.lives ?? 3,
      level: idx,
      timeLeft: level.time,
      totalTime: level.time,
      exitOpen: false,
      alive: true,
      won: false,
      animations: new Map(),
      particles: [],
      screenShake: 0,
      playerDir: Direction.DOWN,
      playerMoving: false,
      deathTimer: 0,
      deathType: 'none',
      deathRow: 0,
      deathCol: 0,
    };
    this.moveTick = 0;
    this.rockTick = 0;
    this.enemyTick = 0;
    this.tickCount = 0;
    this.fallingCells.clear();
  }

  setInput(dir: Direction) {
    this.inputHeld = dir;
    if (dir !== Direction.NONE) {
      this.inputQueue = dir;
    }
  }

  update(dt: number) {
    const s = this.state;

    // Keep ticking death animation even when dead
    if (!s.alive) {
      s.deathTimer += dt;
      this.updateDeathAnim(dt);
      // Still update particles and screen shake
      this.updateParticlesAndShake(dt);
      return;
    }
    if (s.won) return;

    // Timer
    s.timeLeft -= dt;
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      this.killPlayer('time');
      return;
    }

    // Update animations, particles, screen shake
    this.updateParticlesAndShake(dt);

    // Check exit
    if (!s.exitOpen && s.diamondsCollected >= s.diamondsNeeded) {
      s.exitOpen = true;
    }

    // Tick-based updates
    this.tickCount++;

    // Player movement
    this.moveTick++;
    if (this.moveTick >= MOVE_SPEED) {
      const dir = this.inputHeld !== Direction.NONE ? this.inputHeld : this.inputQueue;
      if (dir !== Direction.NONE) {
        this.movePlayer(dir);
        this.inputQueue = Direction.NONE;
      }
      this.moveTick = 0;
      s.playerMoving = dir !== Direction.NONE;
    }

    // Rock/diamond physics
    this.rockTick++;
    if (this.rockTick >= ROCK_SPEED) {
      this.updateFalling();
      this.rockTick = 0;
    }

    // Enemy updates
    this.enemyTick++;
    if (this.enemyTick >= ENEMY_SPEED) {
      this.updateEnemies();
      this.enemyTick = 0;
    }

    // Explosion cleanup
    this.updateExplosions();
  }

  private movePlayer(dir: Direction) {
    const s = this.state;
    const { row: dr, col: dc } = dirToDelta(dir);
    const nr = s.playerRow + dr;
    const nc = s.playerCol + dc;

    s.playerDir = dir;

    if (nr < 0 || nr >= s.rows || nc < 0 || nc >= s.cols) return;

    const target = s.map[nr][nc];

    switch (target) {
      case Tile.EMPTY:
        this.doMove(nr, nc);
        break;

      case Tile.DIRT:
        s.map[nr][nc] = Tile.EMPTY;
        this.doMove(nr, nc);
        this.spawnParticles(nc, nr, '#8B6914', 6);
        this.vibrate(10);
        break;

      case Tile.DIAMOND:
        s.map[nr][nc] = Tile.EMPTY;
        s.diamondsCollected++;
        s.score += 20;
        this.doMove(nr, nc);
        this.spawnParticles(nc, nr, '#00ffff', 12);
        this.spawnParticles(nc, nr, '#ffffff', 6);
        this.vibrate(30);
        break;

      case Tile.BOULDER:
        // Can only push horizontally
        if (dr === 0 && dc !== 0) {
          const beyondC = nc + dc;
          if (beyondC >= 0 && beyondC < s.cols && s.map[nr][beyondC] === Tile.EMPTY) {
            this.addAnimation(nr, nc, nr, beyondC, 'push');
            s.map[nr][beyondC] = Tile.BOULDER;
            s.map[nr][nc] = Tile.EMPTY;
            this.doMove(nr, nc);
            this.vibrate(20);
          }
        }
        break;

      case Tile.EXIT:
        if (s.exitOpen) {
          this.doMove(nr, nc);
          this.levelComplete();
        }
        break;

      default:
        // Wall, steel, enemies — can't move
        break;
    }
  }

  private doMove(nr: number, nc: number) {
    const s = this.state;
    this.addAnimation(s.playerRow, s.playerCol, nr, nc, 'move');
    s.playerRow = nr;
    s.playerCol = nc;
  }

  private updateFalling() {
    const s = this.state;
    const newFalling = new Set<string>();
    // Process bottom-up so rocks fall correctly
    for (let r = s.rows - 2; r >= 0; r--) {
      for (let c = 0; c < s.cols; c++) {
        const tile = s.map[r][c];
        if (tile !== Tile.BOULDER && tile !== Tile.DIAMOND) continue;

        const below = s.map[r + 1]?.[c];
        const cellKey = `${r},${c}`;
        const wasFalling = this.fallingCells.has(cellKey);
        const belowIsPlayer = (r + 1 === s.playerRow && c === s.playerCol);

        // Fall straight down
        // A resting rock does NOT fall onto the player (player blocks it).
        // But a rock already in motion (falling) WILL crush the player.
        if (below === Tile.EMPTY && !belowIsPlayer) {
          s.map[r + 1][c] = tile;
          s.map[r][c] = Tile.EMPTY;
          this.addAnimation(r, c, r + 1, c, 'fall');
          // Track this rock as falling
          this.fallingCells.delete(cellKey);
          newFalling.add(`${r + 1},${c}`);
          continue;
        }

        // Already-falling rock/diamond lands on the player → crush!
        if (belowIsPlayer && wasFalling) {
          this.killPlayer('crush');
          this.fallingCells.delete(cellKey);
          continue;
        }

        // If player is below but rock wasn't falling, just treat player as solid
        if (belowIsPlayer) {
          this.fallingCells.delete(cellKey);
          continue;
        }

        // Roll off other boulders/diamonds/walls
        if (below === Tile.BOULDER || below === Tile.DIAMOND || below === Tile.WALL || below === Tile.STEEL) {
          // Try roll left
          const leftIsPlayer = (r === s.playerRow && c - 1 === s.playerCol);
          const leftBelowIsPlayer = (r + 1 === s.playerRow && c - 1 === s.playerCol);
          if (c > 0 && s.map[r][c - 1] === Tile.EMPTY && !leftIsPlayer
              && s.map[r + 1][c - 1] === Tile.EMPTY && !leftBelowIsPlayer) {
            s.map[r][c - 1] = tile;
            s.map[r][c] = Tile.EMPTY;
            this.addAnimation(r, c, r, c - 1, 'fall');
            this.fallingCells.delete(cellKey);
            newFalling.add(`${r},${c - 1}`);
            continue;
          }
          // Try roll right
          const rightIsPlayer = (r === s.playerRow && c + 1 === s.playerCol);
          const rightBelowIsPlayer = (r + 1 === s.playerRow && c + 1 === s.playerCol);
          if (c < s.cols - 1 && s.map[r][c + 1] === Tile.EMPTY && !rightIsPlayer
              && s.map[r + 1][c + 1] === Tile.EMPTY && !rightBelowIsPlayer) {
            s.map[r][c + 1] = tile;
            s.map[r][c] = Tile.EMPTY;
            this.addAnimation(r, c, r, c + 1, 'fall');
            this.fallingCells.delete(cellKey);
            newFalling.add(`${r},${c + 1}`);
            continue;
          }
        }

        // Rock/diamond that was falling has now landed (blocked) — no longer falling
        this.fallingCells.delete(cellKey);

        // Boulder/diamond landing on enemy
        if (below === Tile.SPIDER || below === Tile.MONSTER) {
          const radius = below === Tile.SPIDER ? 1 : 2;
          this.explodeAt(r + 1, c, radius, true);
          s.map[r][c] = Tile.EMPTY;
          s.screenShake = 8;
          this.vibrate(50);
        }
      }
    }
    // Merge newly falling rocks into the tracking set
    for (const key of newFalling) {
      this.fallingCells.add(key);
    }
  }

  private updateEnemies() {
    const s = this.state;
    const moved = new Set<string>();

    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const key = `${r},${c}`;
        if (moved.has(key)) continue;

        const tile = s.map[r][c];
        if (tile === Tile.SPIDER) {
          this.updateSpider(r, c, moved);
        } else if (tile === Tile.MONSTER) {
          this.updateMonster(r, c, moved);
        }
      }
    }
  }

  private updateSpider(r: number, c: number, moved: Set<string>) {
    const s = this.state;

    // Check if adjacent to player — kill
    if (this.isAdjacentToPlayer(r, c)) {
      this.killPlayer();
      return;
    }

    // Wall-following movement — try to move to an adjacent empty cell
    const dirs: Pos[] = [
      { row: -1, col: 0 }, { row: 0, col: 1 },
      { row: 1, col: 0 }, { row: 0, col: -1 },
    ];

    for (const d of dirs) {
      const nr = r + d.row;
      const nc = c + d.col;
      if (nr >= 0 && nr < s.rows && nc >= 0 && nc < s.cols && s.map[nr][nc] === Tile.EMPTY) {
        if (nr === s.playerRow && nc === s.playerCol) {
          this.killPlayer();
          return;
        }
        s.map[nr][nc] = Tile.SPIDER;
        s.map[r][c] = Tile.EMPTY;
        moved.add(`${nr},${nc}`);
        this.addAnimation(r, c, nr, nc, 'move');
        return;
      }
    }
  }

  private updateMonster(r: number, c: number, moved: Set<string>) {
    const s = this.state;

    if (this.isAdjacentToPlayer(r, c)) {
      this.killPlayer();
      return;
    }

    // Move toward player (greedy)
    const dr = Math.sign(s.playerRow - r);
    const dc = Math.sign(s.playerCol - c);
    const candidates: Pos[] = [];

    if (dr !== 0) candidates.push({ row: r + dr, col: c });
    if (dc !== 0) candidates.push({ row: r, col: c + dc });
    // Fallback to any direction
    candidates.push({ row: r - 1, col: c }, { row: r + 1, col: c });
    candidates.push({ row: r, col: c - 1 }, { row: r, col: c + 1 });

    for (const pos of candidates) {
      if (pos.row >= 0 && pos.row < s.rows && pos.col >= 0 && pos.col < s.cols) {
        if (s.map[pos.row][pos.col] === Tile.EMPTY) {
          if (pos.row === s.playerRow && pos.col === s.playerCol) {
            this.killPlayer();
            return;
          }
          s.map[pos.row][pos.col] = Tile.MONSTER;
          s.map[r][c] = Tile.EMPTY;
          moved.add(`${pos.row},${pos.col}`);
          this.addAnimation(r, c, pos.row, pos.col, 'move');
          return;
        }
      }
    }
  }

  private isAdjacentToPlayer(r: number, c: number): boolean {
    const s = this.state;
    return (
      (Math.abs(r - s.playerRow) + Math.abs(c - s.playerCol)) === 1
    );
  }

  private explodeAt(r: number, c: number, radius: number, toDiamonds: boolean) {
    const s = this.state;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= s.rows || nc < 0 || nc >= s.cols) continue;
        const t = s.map[nr][nc];
        if (t === Tile.STEEL || t === Tile.WALL) continue;
        if (nr === s.playerRow && nc === s.playerCol) {
          this.killPlayer();
        }
        s.map[nr][nc] = Tile.EXPLOSION;
        this.spawnParticles(nc, nr, '#ff4400', 4);
        this.spawnParticles(nc, nr, '#ffaa00', 4);
      }
    }
    // Schedule diamond conversion
    if (toDiamonds) {
      setTimeout(() => {
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= s.rows || nc < 0 || nc >= s.cols) continue;
            if (s.map[nr][nc] === Tile.EXPLOSION) {
              s.map[nr][nc] = Tile.DIAMOND;
            }
          }
        }
      }, 300);
    }
  }

  private updateExplosions() {
    // Explosions without diamond conversion decay to empty
    // Handled by timeout in explodeAt for diamond cases
  }

  private updateParticlesAndShake(dt: number) {
    const s = this.state;

    // Update animations
    for (const [key, anim] of s.animations) {
      anim.progress += dt / ANIM_DURATION;
      if (anim.progress >= 1) {
        s.animations.delete(key);
      }
    }

    // Update particles
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i];
      p.x += p.vx * dt / 16;
      p.y += p.vy * dt / 16;
      p.vy += 0.15 * dt / 16;
      p.life -= dt;
      if (p.life <= 0) {
        s.particles.splice(i, 1);
      }
    }

    // Screen shake decay
    if (s.screenShake > 0) {
      s.screenShake *= Math.max(0, 1 - dt * 0.008);
      if (s.screenShake < 0.1) s.screenShake = 0;
    }
  }

  private updateDeathAnim(dt: number) {
    const s = this.state;
    const t = s.deathTimer;

    if (s.deathType === 'crush') {
      // Phase 1 (0-200ms): Impact flash + small debris
      if (t < 200 && t - dt <= 0) {
        // Initial impact — keep screenShake alive
        s.screenShake = Math.max(s.screenShake, 18);
      }
      // Phase 2 (200-500ms): Big particle explosion
      if (t >= 200 && t - dt < 200) {
        this.spawnParticles(s.deathCol, s.deathRow, '#ff3300', 25);
        this.spawnParticles(s.deathCol, s.deathRow, '#ffaa00', 20);
        this.spawnParticles(s.deathCol, s.deathRow, '#ffdd66', 10);
        // Bone/helmet fragments — lighter colored
        this.spawnParticles(s.deathCol, s.deathRow, '#ffdd00', 8);
        this.spawnParticles(s.deathCol, s.deathRow, '#cccccc', 5);
        s.screenShake = 12;
        this.vibrate(80);
      }
      // Phase 3 (500-800ms): Smoke
      if (t >= 500 && t - dt < 500) {
        this.spawnSmoke(s.deathCol, s.deathRow, 10);
      }
    } else if (s.deathType === 'enemy') {
      // Enemy death — instant explosion
      if (t >= 100 && t - dt < 100) {
        this.spawnParticles(s.deathCol, s.deathRow, '#ff0044', 20);
        this.spawnParticles(s.deathCol, s.deathRow, '#cc00ff', 10);
        s.screenShake = 10;
      }
    }
  }

  private spawnSmoke(cx: number, cy: number, count: number) {
    const s = this.state;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.8;
      s.particles.push({
        x: cx + (Math.random() - 0.5) * 0.3,
        y: cy + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        life: 600 + Math.random() * 600,
        maxLife: 1200,
        color: '#666666',
        size: 4 + Math.random() * 4,
      });
    }
  }

  private killPlayer(type: 'crush' | 'enemy' | 'time' = 'enemy') {
    const s = this.state;
    if (!s.alive) return;
    s.alive = false;
    s.lives--;
    s.deathTimer = 0;
    s.deathType = type;
    s.deathRow = s.playerRow;
    s.deathCol = s.playerCol;
    s.screenShake = type === 'crush' ? 20 : 12;
    this.vibrate(type === 'crush' ? 150 : 100);

    // Delayed particle burst — crush gets a bigger, phased explosion
    if (type === 'crush') {
      // Immediate small burst (impact)
      this.spawnParticles(s.playerCol, s.playerRow, '#ffaa00', 6);
    } else {
      this.spawnParticles(s.playerCol, s.playerRow, '#ff0000', 20);
      this.spawnParticles(s.playerCol, s.playerRow, '#ffaa00', 15);
    }
  }

  private levelComplete() {
    const s = this.state;
    // Time bonus
    const timeBonus = Math.floor(s.timeLeft / 1000) * 5;
    s.score += timeBonus;
    s.won = true;
    this.vibrate(50);
    this.spawnParticles(s.playerCol, s.playerRow, '#00ff00', 30);
    this.spawnParticles(s.playerCol, s.playerRow, '#ffff00', 20);
  }

  nextLevel() {
    const next = this.state.level + 1;
    if (next < LEVELS.length) {
      this.loadLevel(next);
    } else {
      // Game complete — restart with higher score
      this.loadLevel(0);
    }
  }

  restartLevel() {
    this.loadLevel(this.state.level);
  }

  private addAnimation(fromR: number, fromC: number, toR: number, toC: number, type: CellAnim['type']) {
    const key = `${toR},${toC}`;
    this.state.animations.set(key, {
      fromRow: fromR, fromCol: fromC,
      toRow: toR, toCol: toC,
      progress: 0, type,
    });
  }

  spawnParticles(cx: number, cy: number, color: string, count: number) {
    const s = this.state;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      s.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 400 + Math.random() * 400,
        maxLife: 800,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private vibrate(ms: number) {
    if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  }
}

function charToTile(ch: string): Tile {
  switch (ch) {
    case ' ': return Tile.EMPTY;
    case '.': return Tile.DIRT;
    case '|': return Tile.STEEL;
    case 'o': return Tile.BOULDER;
    case '*': return Tile.DIAMOND;
    case 'p': return Tile.PLAYER;
    case 'g': return Tile.EXIT;
    case 'c': return Tile.SPIDER;
    case 'e': return Tile.MONSTER;
    case 'x': return Tile.WATER;
    default: return Tile.DIRT;
  }
}

function dirToDelta(dir: Direction): { row: number; col: number } {
  switch (dir) {
    case Direction.UP: return { row: -1, col: 0 };
    case Direction.DOWN: return { row: 1, col: 0 };
    case Direction.LEFT: return { row: 0, col: -1 };
    case Direction.RIGHT: return { row: 0, col: 1 };
    default: return { row: 0, col: 0 };
  }
}
