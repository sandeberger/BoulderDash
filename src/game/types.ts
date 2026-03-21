export enum Tile {
  EMPTY = 0,
  DIRT = 1,
  WALL = 2,
  BOULDER = 3,
  DIAMOND = 4,
  PLAYER = 5,
  EXIT = 6,
  SPIDER = 7,
  MONSTER = 8,
  WATER = 9,
  STEEL = 10,     // indestructible border
  EXPLOSION = 11,
}

export interface Pos {
  row: number;
  col: number;
}

export interface CellAnim {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  progress: number; // 0..1
  type: 'move' | 'fall' | 'push';
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface GameState {
  map: Tile[][];
  rows: number;
  cols: number;
  playerRow: number;
  playerCol: number;
  diamondsCollected: number;
  diamondsNeeded: number;
  score: number;
  lives: number;
  level: number;
  timeLeft: number;      // ms
  totalTime: number;     // ms
  exitOpen: boolean;
  alive: boolean;
  won: boolean;
  animations: Map<string, CellAnim>;
  particles: Particle[];
  screenShake: number;
  playerDir: Direction;
  playerMoving: boolean;
}

export enum Direction {
  NONE = 0,
  UP = 1,
  DOWN = 2,
  LEFT = 3,
  RIGHT = 4,
}

export interface LevelDef {
  id: number;
  rows: number;
  cols: number;
  diamonds: number;
  time: number; // ms
  map: string[];
}

export type InputAction = Direction;
