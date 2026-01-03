
export interface Vector2D {
  x: number;
  y: number;
}

export interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface Enemy extends GameObject {
  vx: number;
  vy: number;
}

export enum GameStatus {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  WIN_MESSAGE = 'WIN_MESSAGE',
  CRASHED = 'CRASHED'
}
