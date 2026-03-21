import { Direction } from '../game/types';

type DirectionCallback = (dir: Direction) => void;

export class TouchControls {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onDirection: DirectionCallback;
  private currentDir: Direction = Direction.NONE;
  private dpadSize: number;
  private touchId: number | null = null;
  private pressed: Direction = Direction.NONE;
  private keyboardDirs = new Set<Direction>();

  constructor(container: HTMLElement, onDirection: DirectionCallback) {
    this.container = container;
    this.onDirection = onDirection;

    // Size the D-pad based on screen
    this.dpadSize = Math.min(160, Math.floor(window.innerWidth * 0.38));

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.dpadSize;
    this.canvas.height = this.dpadSize;
    this.canvas.style.width = `${this.dpadSize}px`;
    this.canvas.style.height = `${this.dpadSize}px`;
    this.canvas.style.touchAction = 'none';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    this.setupTouch();
    this.setupKeyboard();
    this.draw();
  }

  private setupTouch() {
    const getDir = (x: number, y: number): Direction => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = x - rect.left - cx;
      const dy = y - rect.top - cy;
      const deadzone = rect.width * 0.15;

      if (Math.abs(dx) < deadzone && Math.abs(dy) < deadzone) {
        return Direction.NONE;
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? Direction.RIGHT : Direction.LEFT;
      } else {
        return dy > 0 ? Direction.DOWN : Direction.UP;
      }
    };

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      this.touchId = touch.identifier;
      const dir = getDir(touch.clientX, touch.clientY);
      this.setDirection(dir);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchId) {
          const dir = getDir(touch.clientX, touch.clientY);
          this.setDirection(dir);
        }
      }
    }, { passive: false });

    const endTouch = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchId) {
          this.touchId = null;
          this.setDirection(Direction.NONE);
        }
      }
    };

    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('touchcancel', endTouch);

    // Also support mouse for desktop testing
    let mouseDown = false;
    this.canvas.addEventListener('mousedown', (e) => {
      mouseDown = true;
      const dir = getDir(e.clientX, e.clientY);
      this.setDirection(dir);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (mouseDown) {
        const dir = getDir(e.clientX, e.clientY);
        this.setDirection(dir);
      }
    });
    window.addEventListener('mouseup', () => {
      if (mouseDown) {
        mouseDown = false;
        this.setDirection(Direction.NONE);
      }
    });
  }

  private setupKeyboard() {
    const keyMap: Record<string, Direction> = {
      'ArrowUp': Direction.UP, 'KeyW': Direction.UP,
      'ArrowDown': Direction.DOWN, 'KeyS': Direction.DOWN,
      'ArrowLeft': Direction.LEFT, 'KeyA': Direction.LEFT,
      'ArrowRight': Direction.RIGHT, 'KeyD': Direction.RIGHT,
    };

    window.addEventListener('keydown', (e) => {
      const dir = keyMap[e.code];
      if (dir !== undefined) {
        e.preventDefault();
        this.keyboardDirs.add(dir);
        this.updateKeyboardDir();
      }
    });

    window.addEventListener('keyup', (e) => {
      const dir = keyMap[e.code];
      if (dir !== undefined) {
        this.keyboardDirs.delete(dir);
        this.updateKeyboardDir();
      }
    });
  }

  private updateKeyboardDir() {
    // Priority: last key pressed (most recent direction in the set)
    if (this.keyboardDirs.size === 0) {
      if (this.touchId === null) {
        this.setDirection(Direction.NONE);
      }
    } else {
      // Take the last one
      let last = Direction.NONE;
      for (const d of this.keyboardDirs) last = d;
      this.setDirection(last);
    }
  }

  private setDirection(dir: Direction) {
    if (dir !== this.currentDir) {
      this.currentDir = dir;
      this.pressed = dir;
      this.onDirection(dir);
      this.draw();

      // Haptic for direction change
      if (dir !== Direction.NONE && navigator.vibrate) {
        navigator.vibrate(5);
      }
    }
  }

  private draw() {
    const ctx = this.ctx;
    const s = this.dpadSize;
    const center = s / 2;
    const btnSize = s * 0.3;
    const gap = s * 0.02;

    ctx.clearRect(0, 0, s, s);

    // D-pad background circle
    ctx.beginPath();
    ctx.arc(center, center, s * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    // Draw each direction button
    const dirs: { dir: Direction; x: number; y: number; label: string }[] = [
      { dir: Direction.UP, x: center - btnSize / 2, y: center - btnSize - gap - btnSize / 2, label: '▲' },
      { dir: Direction.DOWN, x: center - btnSize / 2, y: center + gap + btnSize / 2, label: '▼' },
      { dir: Direction.LEFT, x: center - btnSize - gap - btnSize / 2, y: center - btnSize / 2, label: '◀' },
      { dir: Direction.RIGHT, x: center + gap + btnSize / 2, y: center - btnSize / 2, label: '▶' },
    ];

    for (const btn of dirs) {
      const isPressed = this.pressed === btn.dir;
      const radius = 6;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(btn.x, btn.y, btnSize, btnSize, radius);
      } else {
        ctx.rect(btn.x, btn.y, btnSize, btnSize);
      }
      ctx.fillStyle = isPressed
        ? 'rgba(245,175,25,0.5)'
        : 'rgba(255,255,255,0.12)';
      ctx.fill();

      if (isPressed) {
        ctx.strokeStyle = 'rgba(245,175,25,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = isPressed ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.font = `${btnSize * 0.45}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x + btnSize / 2, btn.y + btnSize / 2);
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(center, center, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
  }

  resize() {
    this.dpadSize = Math.min(160, Math.floor(window.innerWidth * 0.38));
    this.canvas.width = this.dpadSize;
    this.canvas.height = this.dpadSize;
    this.canvas.style.width = `${this.dpadSize}px`;
    this.canvas.style.height = `${this.dpadSize}px`;
    this.draw();
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
