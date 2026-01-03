
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Vector2D, Enemy, GameStatus } from './types';
import { 
  PLAYER_SIZE, 
  ENEMY_SIZE, 
  INITIAL_SPEED, 
  SPEED_MULTIPLIER, 
  SPEED_UP_INTERVAL, 
  WIN_THRESHOLD, 
  WIN_DISPLAY_TIME 
} from './constants';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [lastRunTime, setLastRunTime] = useState<number | null>(null);
  const [lastRunEnemyCount, setLastRunEnemyCount] = useState<number | null>(null);
  const [highScore, setHighScore] = useState(0);
  const [enemyCount, setEnemyCount] = useState(1);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [isLoadingIcon, setIsLoadingIcon] = useState(true);

  // Initialize and generate assets
  useEffect(() => {
    const generateIcon = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: [{ parts: [{ text: "Minimalist game icon for '19 seconds'. A glowing neon green square with a digital trail effect, 1:1 aspect ratio, clean dark background, vector style, futuristic look." }] }],
          config: { imageConfig: { aspectRatio: "1:1" } },
        });

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            setIconUrl(`data:image/png;base64,${part.inlineData.data}`);
            break;
          }
        }
      } catch (error) {
        console.error("Failed to generate icon:", error);
      } finally {
        setIsLoadingIcon(false);
      }
    };

    const saved = localStorage.getItem('squareSurvivalRecord');
    if (saved) {
      setHighScore(parseInt(saved, 10));
    }
    generateIcon();
  }, []);

  // Game state references
  const gameState = useRef({
    playerPos: { x: 0, y: 0 } as Vector2D,
    enemies: [] as Enemy[],
    startTime: 0,
    lastSpeedUpTime: 0,
    status: GameStatus.IDLE,
    enemyCount: 1,
    isInteracting: false,
    viewportSize: 0,
    offsetX: 0,
    offsetY: 0,
    currentHighScore: 0,
    accumulatedTime: 0,
    currentSurvivalTime: 0
  });

  useEffect(() => {
    gameState.current.currentHighScore = highScore;
  }, [highScore]);

  const initEnemies = (count: number, size: number): Enemy[] => {
    return Array.from({ length: count }).map(() => {
      const side = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      if (side === 0) { x = 0; y = Math.random() * size; }
      else if (side === 1) { x = size - ENEMY_SIZE; y = Math.random() * size; }
      else if (side === 2) { x = Math.random() * size; y = 0; }
      else { x = Math.random() * size; y = size - ENEMY_SIZE; }

      const angle = Math.random() * Math.PI * 2;
      return {
        x, y,
        width: ENEMY_SIZE,
        height: ENEMY_SIZE,
        vx: Math.cos(angle) * INITIAL_SPEED,
        vy: Math.sin(angle) * INITIAL_SPEED,
        color: '#ef4444',
      };
    });
  };

  const resetGame = useCallback((count: number, isLevelUp = false) => {
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.85;
    const ox = (window.innerWidth - size) / 2;
    const oy = (window.innerHeight - size) / 2;

    const randomX = size / 2 - PLAYER_SIZE / 2;
    const randomY = size / 2 - PLAYER_SIZE / 2;

    if (!isLevelUp) {
      setLastRunTime(gameState.current.currentSurvivalTime);
      setLastRunEnemyCount(gameState.current.enemyCount);
      gameState.current.accumulatedTime = 0;
      gameState.current.currentSurvivalTime = 0;
      setSurvivalTime(0);
    }

    gameState.current = {
      ...gameState.current,
      playerPos: { x: randomX, y: randomY },
      enemies: initEnemies(count, size),
      startTime: Date.now(),
      lastSpeedUpTime: Date.now(),
      status: isLevelUp ? GameStatus.PLAYING : GameStatus.IDLE,
      enemyCount: count,
      viewportSize: size,
      offsetX: ox,
      offsetY: oy,
      isInteracting: isLevelUp
    };
    
    setEnemyCount(count);
    setStatus(isLevelUp ? GameStatus.PLAYING : GameStatus.IDLE);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      resetGame(gameState.current.enemyCount);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const startInteraction = (clientX: number, clientY: number) => {
      const gs = gameState.current;
      const mx = clientX - gs.offsetX;
      const my = clientY - gs.offsetY;

      if (gs.status === GameStatus.IDLE) {
        if (mx >= 0 && mx <= gs.viewportSize && my >= 0 && my <= gs.viewportSize) {
          gs.isInteracting = true;
          gs.status = GameStatus.PLAYING;
          gs.startTime = Date.now();
          gs.lastSpeedUpTime = Date.now();
          
          let newX = mx - PLAYER_SIZE / 2;
          let newY = my - PLAYER_SIZE / 2;
          newX = Math.max(0, Math.min(newX, gs.viewportSize - PLAYER_SIZE));
          newY = Math.max(0, Math.min(newY, gs.viewportSize - PLAYER_SIZE));
          gs.playerPos = { x: newX, y: newY };

          setStatus(GameStatus.PLAYING);
        }
      } else {
        gs.isInteracting = true;
      }
    };

    const moveInteraction = (clientX: number, clientY: number) => {
      const gs = gameState.current;
      if (gs.status === GameStatus.PLAYING && gs.isInteracting) {
        const mx = clientX - gs.offsetX;
        const my = clientY - gs.offsetY;
        
        let newX = mx - PLAYER_SIZE / 2;
        let newY = my - PLAYER_SIZE / 2;

        const size = gs.viewportSize;
        newX = Math.max(0, Math.min(newX, size - PLAYER_SIZE));
        newY = Math.max(0, Math.min(newY, size - PLAYER_SIZE));

        gs.playerPos = { x: newX, y: newY };
      }
    };

    const endInteraction = () => {
      gameState.current.isInteracting = false;
    };

    const handleMouseDown = (e: MouseEvent) => startInteraction(e.clientX, e.clientY);
    const handleMouseMove = (e: MouseEvent) => moveInteraction(e.clientX, e.clientY);
    const handleMouseUp = () => endInteraction();
    const handleTouchStart = (e: TouchEvent) => e.touches.length > 0 && startInteraction(e.touches[0].clientX, e.touches[0].clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) moveInteraction(e.touches[0].clientX, e.touches[0].clientY);
      if (gameState.current.status === GameStatus.PLAYING) e.preventDefault();
    };
    const handleTouchEnd = () => endInteraction();

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    let animationFrameId: number;

    const gameLoop = () => {
      const now = Date.now();
      const gs = gameState.current;
      const size = gs.viewportSize;

      if (gs.status === GameStatus.PLAYING) {
        const currentSegmentElapsed = (now - gs.startTime) / 1000;
        const totalElapsed = gs.accumulatedTime + currentSegmentElapsed;
        const floorTotal = Math.floor(totalElapsed);
        gs.currentSurvivalTime = floorTotal;
        setSurvivalTime(floorTotal);

        if (floorTotal > gs.currentHighScore) {
          setHighScore(floorTotal);
          localStorage.setItem('squareSurvivalRecord', floorTotal.toString());
        }

        if (now - gs.lastSpeedUpTime >= SPEED_UP_INTERVAL) {
          gs.enemies.forEach(e => { e.vx *= SPEED_MULTIPLIER; e.vy *= SPEED_MULTIPLIER; });
          gs.lastSpeedUpTime = now;
        }

        if (currentSegmentElapsed >= WIN_THRESHOLD) {
          gs.status = GameStatus.WIN_MESSAGE;
          gs.accumulatedTime += WIN_THRESHOLD;
          setStatus(GameStatus.WIN_MESSAGE);
          setTimeout(() => resetGame(gs.enemyCount + 1, true), WIN_DISPLAY_TIME);
        }

        if (gs.playerPos.x <= 0 || gs.playerPos.x >= size - PLAYER_SIZE || gs.playerPos.y <= 0 || gs.playerPos.y >= size - PLAYER_SIZE) {
          resetGame(1);
          animationFrameId = requestAnimationFrame(gameLoop);
          return;
        }

        gs.enemies.forEach(enemy => {
          enemy.x += enemy.vx; enemy.y += enemy.vy;
          if (enemy.x <= 0 || enemy.x + enemy.width >= size) { enemy.vx = -enemy.vx; enemy.x = enemy.x <= 0 ? 0 : size - enemy.width; }
          if (enemy.y <= 0 || enemy.y + enemy.height >= size) { enemy.vy = -enemy.vy; enemy.y = enemy.y <= 0 ? 0 : size - enemy.height; }
          if (gs.playerPos.x < enemy.x + enemy.width && gs.playerPos.x + PLAYER_SIZE > enemy.x && gs.playerPos.y < enemy.y + enemy.height && gs.playerPos.y + PLAYER_SIZE > enemy.y) {
            resetGame(1);
          }
        });
      }

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(gs.offsetX, gs.offsetY);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, size, size);

      const isNearEdge = gs.status === GameStatus.PLAYING && (gs.playerPos.x < 10 || gs.playerPos.x > size - PLAYER_SIZE - 10 || gs.playerPos.y < 10 || gs.playerPos.y > size - PLAYER_SIZE - 10);
      ctx.strokeStyle = isNearEdge ? '#f87171' : '#64748b';
      ctx.lineWidth = 6;
      ctx.shadowBlur = isNearEdge ? 15 : 0;
      ctx.shadowColor = '#ef4444';
      ctx.strokeRect(0, 0, size, size);
      ctx.shadowBlur = 0;
      
      gs.enemies.forEach(enemy => {
        ctx.fillStyle = enemy.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
      });

      ctx.fillStyle = gs.isInteracting ? '#4ade80' : '#22c55e';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#22c55e';
      ctx.fillRect(gs.playerPos.x, gs.playerPos.y, PLAYER_SIZE, PLAYER_SIZE);
      ctx.restore();

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      cancelAnimationFrame(animationFrameId);
    };
  }, [resetGame]);

  return (
    <div className={`relative w-full h-screen bg-slate-900 overflow-hidden font-sans select-none flex items-center justify-center ${status === GameStatus.PLAYING ? 'cursor-none' : 'cursor-default'}`}>
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Timer UI */}
      <div className="absolute top-8 md:top-12 left-1/2 -translate-x-1/2 pointer-events-none text-center z-10">
        <div className="text-white text-5xl md:text-7xl font-black tracking-tighter drop-shadow-2xl">
          {survivalTime}s
        </div>
        <div className="text-emerald-400 text-[10px] md:text-xs mt-1 uppercase tracking-[0.4em] font-bold">
          Total Survive Time
        </div>
      </div>

      {/* Side HUD */}
      <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 text-right pointer-events-none flex flex-col gap-3 md:gap-4 z-10">
        <div>
          <div className="text-slate-400 text-[10px] md:text-sm font-bold uppercase tracking-wider">Danger Level</div>
          <div className="text-white text-2xl md:text-4xl font-black">
            {enemyCount} {enemyCount === 1 ? 'Enemy' : 'Enemies'}
          </div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-1 md:px-4 md:py-2 rounded-xl">
          <div className="text-amber-500 text-[8px] md:text-xs font-bold uppercase tracking-[0.2em]">Highest Score</div>
          <div className="text-white text-xl md:text-3xl font-black">{highScore}s</div>
        </div>
      </div>

      {/* Tutorial Overlay */}
      {status === GameStatus.IDLE && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
          
          <div className="relative bg-slate-800/95 backdrop-blur-md px-6 py-8 md:px-12 md:py-10 rounded-[2.5rem] border border-white/10 shadow-2xl max-w-md w-full mx-4 animate-in zoom-in duration-500 overflow-hidden text-center">
            <div className="flex flex-col items-center gap-6 relative z-10">
              {/* AI Generated Icon */}
              <div className="relative">
                {isLoadingIcon ? (
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-700 rounded-2xl animate-pulse" />
                ) : iconUrl ? (
                  <img src={iconUrl} alt="Game Icon" className="w-20 h-20 md:w-24 md:h-24 rounded-2xl shadow-lg border border-white/10" />
                ) : (
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-emerald-500 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.4)]" />
                )}
                {!isLoadingIcon && <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-emerald-400 rounded-full animate-ping opacity-50" />}
              </div>

              <div>
                <h2 className="text-white font-black text-2xl md:text-3xl uppercase tracking-tighter mb-2">
                  19 seconds
                </h2>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">
                  Navigate the void. Dodge the threat.<br/>Become a legend.
                </p>
              </div>

              {/* Result display after a loss */}
              {lastRunTime !== null && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 w-full flex flex-col gap-4 animate-in slide-in-from-bottom duration-500">
                  <div className="flex flex-col items-center">
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Time Survived</span>
                    <span className="text-white text-4xl font-black italic">{lastRunTime}s</span>
                  </div>
                  <div className="flex items-center justify-between w-full px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Danger Level</span>
                    <span className="text-red-400 font-black text-lg">
                      {lastRunEnemyCount} {lastRunEnemyCount === 1 ? 'Enemy' : 'Enemies'}
                    </span>
                  </div>
                </div>
              )}

              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              <span className="text-emerald-400 font-black text-xs md:text-sm uppercase tracking-[0.3em] text-center animate-pulse">
                PRESS & HOLD INSIDE THE AREA<br/>TO START DODGING
              </span>

              <div className="text-red-400 font-bold text-[10px] md:text-xs uppercase bg-red-400/10 px-4 py-2 rounded-full border border-red-400/20">
                WARNING: DO NOT TOUCH THE EDGES!
              </div>

              {highScore > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Global Best:</span>
                  <span className="text-amber-400 font-black text-lg">{highScore}s</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Level Up Message */}
      {status === GameStatus.WIN_MESSAGE && (
        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center z-50 animate-in fade-in duration-500 px-4">
          <div className="text-center">
            <h1 className="text-yellow-400 text-5xl md:text-8xl font-black uppercase italic tracking-tighter mb-4 animate-bounce">
              ABSOLUTE LEGEND
            </h1>
            <p className="text-white text-2xl md:text-4xl font-bold mb-10 md:mb-12">
              LEVEL {enemyCount} CLEARED!
            </p>
            <div className="inline-flex items-center space-x-4 md:space-x-6 bg-white/5 px-6 py-3 md:px-8 md:py-4 rounded-full border border-white/10">
              <div className="w-3 h-3 md:w-4 md:h-4 bg-red-500 rounded-full animate-ping" />
              <span className="text-red-400 font-black uppercase tracking-[0.2em] text-sm md:text-lg">
                THREAT ESCALATED: {enemyCount + 1} {enemyCount + 1 === 1 ? 'ENEMY' : 'ENEMIES'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
