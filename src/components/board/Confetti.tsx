import { useEffect, useRef } from 'react';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; rot: number; vr: number;
  color: string; round: boolean; wobble: number; wobbleSpeed: number;
}

interface ConfettiProps {
  /** Palette; winners' colours first. */
  colors: string[];
  /** Burst starts when this flips true. */
  fire: boolean;
}

/** Lightweight canvas confetti: two side cannons plus a shower from the top. */
export function Confetti({ colors, fire }: ConfettiProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const palette = [...colors, ...colors, '#ffd700', '#ffffff', '#ffe27a'];
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const make = (x: number, y: number, vx: number, vy: number): Particle => ({
      x, y, vx, vy,
      w: rand(6, 12), h: rand(10, 20),
      rot: rand(0, Math.PI * 2), vr: rand(-0.3, 0.3),
      color: palette[Math.floor(Math.random() * palette.length)],
      round: Math.random() < 0.25,
      wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.05, 0.15),
    });

    const particles: Particle[] = [];
    // Cannons from the lower corners, aimed inward and up
    for (let i = 0; i < 90; i++) {
      const speed = rand(18, 32);
      const spread = rand(-0.35, 0.35);
      particles.push(make(0, H() * 0.95, Math.sin(0.55 + spread) * speed, -Math.cos(0.55 + spread) * speed));
      particles.push(make(W(), H() * 0.95, -Math.sin(0.55 + spread) * speed, -Math.cos(0.55 + spread) * speed));
    }
    // Shower from the top, staggered via negative y
    for (let i = 0; i < 160; i++) {
      particles.push(make(rand(0, W()), rand(-H() * 0.8, -20), rand(-2, 2), rand(2, 6)));
    }
    let raf = 0;
    const started = performance.now();
    const frame = (now: number) => {
      ctx.clearRect(0, 0, W(), H());
      let alive = 0;
      for (const p of particles) {
        p.vy += 0.38;
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.x += p.vx + Math.sin(p.wobble) * 0.8;
        p.y += p.vy;
        p.rot += p.vr;
        p.wobble += p.wobbleSpeed;
        if (p.y < H() + 40) alive++;
        else continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, (H() + 40 - p.y) / 200 + 0.4));
        const squash = Math.abs(Math.cos(p.wobble));
        if (p.round) {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.w / 2, (p.w / 2) * squash + 1, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, (-p.h / 2) * squash, p.w, p.h * squash + 1);
        }
        ctx.restore();
      }
      if (alive > 0 && now - started < 9000) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W(), H());
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, W(), H());
    };
    // colours are stable for a given finale; only the trigger matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire]);

  return <canvas ref={ref} className="finale-confetti" aria-hidden="true" />;
}
