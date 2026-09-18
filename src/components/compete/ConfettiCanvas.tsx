"use client";

// ============================================================================
// ConfettiCanvas — self-contained canvas confetti engine (no npm dependency).
// Ported from the /prototype/badge-confetti celebration. Used by BadgePopup to
// fire a "win" confetti burst when a badge is earned in round results.
//
// - Full-screen fixed canvas, below modal popups, pointer-events none.
// - Imperative handle: burst(x, y, { count }) — spawns particles at a point.
// - rAF loop with gravity / drag / rotation / fade; cleans up on unmount.
// - Respects prefers-reduced-motion: burst() is a no-op in that case.
// ============================================================================

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

const CONFETTI_COLORS = [
  "#ffd54a", "#ffb300", "#ff8a00", "#fff3c4",
  "#22d3ee", "#8b5cf6", "#ff5e7e", "#4ade80",
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rot: number;
  rotSpeed: number;
  shape: "rect" | "circle";
  life: number;
  maxLife: number;
  drag: number;
  gravity: number;
}

export interface ConfettiHandle {
  burst: (x: number, y: number, opts?: { count?: number }) => void;
}

const ConfettiCanvas = forwardRef<ConfettiHandle>(function ConfettiCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef(0);

  const frame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const alive: Particle[] = [];
    for (const p of particlesRef.current) {
      p.life += 1;
      if (p.life >= p.maxLife) continue;

      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;

      const alpha = 1 - p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      alive.push(p);
    }
    ctx.globalAlpha = 1;
    particlesRef.current = alive;

    if (alive.length > 0) {
      rafRef.current = requestAnimationFrame(frame);
    } else {
      rafRef.current = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    burst(x, y, opts) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      // Reduced motion: skip the animation entirely.
      if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = opts?.count ?? 170;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 13;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4.5,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.3,
          shape: Math.random() < 0.25 ? "circle" : "rect",
          life: 0,
          maxLife: 110 + Math.random() * 70,
          drag: 0.985,
          gravity: 0.32,
        });
      }

      if (!rafRef.current) rafRef.current = requestAnimationFrame(frame);
    },
  }));

  // Resize backing store while keeping CSS size full-screen.
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 10001, // below BadgePopup (10002), above page content
        pointerEvents: "none",
      }}
    />
  );
});

export default ConfettiCanvas;
