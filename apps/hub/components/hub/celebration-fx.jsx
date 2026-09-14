"use client";

import React from "react";

// Celebration FX Colors — aligned with Moonlight Moonstone Command Deck palette:
// Cool Moonstone blues, radiant champagne starlight gold, emerald and crisp pearl white.
const CELEBRATION_COLORS = [
  "#8ca8d8", // Moonstone 300
  "#c5d8f6", // Moonstone 100
  "#5274a8", // Brand accent
  "#ffd166", // Champagne gold
  "#ffeaa7", // Starlight gold
  "#f9ca24", // Deep radiant gold
  "#38ef7d", // Soft emerald success
  "#00d2d3", // Electric cyan
  "#ffffff", // Crisp pearl white
];

const SPARKLE_COLORS = [
  "#ffd166",
  "#ffeaa7",
  "#c5d8f6",
  "#8ca8d8",
  "#ffffff",
];

// Throttle timestamp for major celebration bursts
let lastMajorCelebrationTime = 0;

// Helper to trigger celebration globally from any event handler or async callback
export function triggerCelebration({ mode = "confetti", origin, count } = {}) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  // 600ms throttle for fireworks bursts
  if (mode === "fireworks" && now - lastMajorCelebrationTime < 600) {
    return;
  }
  if (mode === "fireworks") {
    lastMajorCelebrationTime = now;
  }

  // Mobile haptic feedback
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([20, 40, 20]);
    }
  } catch (_) {}

  // If reduced motion is preferred, dispatch event with reduced flag
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  window.dispatchEvent(
    new CustomEvent("hub-celebrate", {
      detail: { mode, origin, count, reduced },
    })
  );
}

// Helper to trigger micro-sparkle at specific screen coordinates (e.g. checkbox click)
export function triggerSparkleAt(x, y, count = 18) {
  if (typeof window === "undefined" || x == null || y == null) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduced) return;

  // Mobile haptic feedback for micro sparkle
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(12);
    }
  } catch (_) {}

  window.dispatchEvent(
    new CustomEvent("hub-celebrate", {
      detail: { mode: "sparkle", origin: { x, y, isPixel: true }, count },
    })
  );
}

export function useCelebration() {
  const celebrate = React.useCallback((options) => triggerCelebration(options), []);
  const sparkle = React.useCallback((x, y, count) => triggerSparkleAt(x, y, count), []);
  return { celebrate, sparkle };
}

// Maximum concurrent particles to ensure stable 60-120 FPS
const MAX_PARTICLES = 200;

// Particle object pools to prevent garbage collection pauses
const confettiPool = [];
const sparklePool = [];

// Particle shape classes
class ConfettiParticle {
  constructor(x = 0, y = 0, vx = 0, vy = 0, color = "#8ca8d8") {
    this.init(x, y, vx, vy, color);
  }

  init(x, y, vx, vy, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = Math.random() * 6 + 4;
    this.w = this.size;
    this.h = this.size * (Math.random() > 0.4 ? 1.6 : 0.8);
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 12;
    this.wobble = Math.random() * 10;
    this.wobbleSpeed = Math.random() * 0.1 + 0.05;
    this.gravity = 0.22;
    this.drag = 0.975;
    this.opacity = 1;
    this.fade = Math.random() * 0.012 + 0.008;
    this.isStar = Math.random() < 0.25;
    this.active = true;
    return this;
  }

  update() {
    if (!this.active) return false;
    this.vx *= this.drag;
    this.vy *= this.drag;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    this.wobble += this.wobbleSpeed;
    this.opacity -= this.fade;
    const boundary = typeof window !== "undefined" ? window.innerHeight + 50 : 1200;
    if (this.opacity <= 0 || this.y >= boundary) {
      this.active = false;
      return false;
    }
    return true;
  }

  draw(ctx) {
    if (!this.active || this.opacity <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.scale(Math.cos(this.wobble), 1);
    ctx.globalAlpha = Math.max(0, Math.min(1, this.opacity));
    ctx.fillStyle = this.color;

    if (this.isStar) {
      draw4PointStar(ctx, 0, 0, this.size * 0.8, this.size * 0.3);
    } else {
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}

class SparkleParticle {
  constructor(x = 0, y = 0, vx = 0, vy = 0, color = "#ffd166") {
    this.init(x, y, vx, vy, color);
  }

  init(x, y, vx, vy, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = Math.random() * 5 + 3;
    this.maxSize = this.size * (Math.random() * 0.8 + 1.2);
    this.currentSize = 1;
    this.opacity = 1;
    this.life = 0;
    this.maxLife = Math.random() * 25 + 25; // 25-50 frames (~500-800ms)
    this.rotation = Math.random() * 360;
    this.rotSpeed = (Math.random() - 0.5) * 8;
    this.active = true;
    return this;
  }

  update() {
    if (!this.active) return false;
    this.life += 1;
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.94;
    this.vy *= 0.94;
    this.rotation += this.rotSpeed;

    const progress = this.life / this.maxLife;
    if (progress < 0.3) {
      this.currentSize = (progress / 0.3) * this.maxSize;
    } else {
      this.currentSize = (1 - (progress - 0.3) / 0.7) * this.maxSize;
    }
    this.opacity = 1 - progress;
    if (progress >= 1 || this.opacity <= 0) {
      this.active = false;
      return false;
    }
    return true;
  }

  draw(ctx) {
    if (!this.active || this.opacity <= 0 || this.currentSize <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.globalAlpha = Math.max(0, Math.min(1, this.opacity));
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    draw4PointStar(ctx, 0, 0, this.currentSize, this.currentSize * 0.35);
    ctx.restore();
  }
}

function acquireConfetti(x, y, vx, vy, color) {
  const p = confettiPool.length > 0 ? confettiPool.pop() : new ConfettiParticle();
  return p.init(x, y, vx, vy, color);
}

function releaseConfetti(p) {
  p.active = false;
  if (confettiPool.length < 150) {
    confettiPool.push(p);
  }
}

function acquireSparkle(x, y, vx, vy, color) {
  const p = sparklePool.length > 0 ? sparklePool.pop() : new SparkleParticle();
  return p.init(x, y, vx, vy, color);
}

function releaseSparkle(p) {
  p.active = false;
  if (sparklePool.length < 150) {
    sparklePool.push(p);
  }
}

class FireworkRocket {
  constructor(startX, targetY, color) {
    this.x = startX;
    this.y = typeof window !== "undefined" ? window.innerHeight : 800;
    this.targetY = targetY;
    this.vy = -(Math.random() * 4 + 11);
    this.vx = (Math.random() - 0.5) * 2.5;
    this.color = color;
    this.exploded = false;
    this.trail = [];
  }

  update() {
    this.trail.push({ x: this.x, y: this.y, alpha: 1 });
    if (this.trail.length > 7) this.trail.shift();
    this.trail.forEach((t) => { t.alpha *= 0.82; });

    this.x += this.vx;
    this.y += this.vy;
    this.vy *= 0.985;

    if (this.vy >= -1.5 || this.y <= this.targetY) {
      this.exploded = true;
      return false; // Time to explode
    }
    return true;
  }

  draw(ctx) {
    this.trail.forEach((t) => {
      ctx.save();
      ctx.globalAlpha = t.alpha * 0.7;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function draw4PointStar(ctx, cx, cy, outerRadius, innerRadius) {
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / 4;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

export function CelebrationCanvas() {
  const canvasRef = React.useRef(null);
  const particlesRef = React.useRef([]);
  const rocketsRef = React.useRef([]);
  const animFrameRef = React.useRef(null);
  const [liveAnnouncement, setLiveAnnouncement] = React.useState("");

  const addParticle = React.useCallback((p) => {
    if (particlesRef.current.length >= MAX_PARTICLES) {
      const oldest = particlesRef.current.shift();
      if (oldest instanceof ConfettiParticle) releaseConfetti(oldest);
      else if (oldest instanceof SparkleParticle) releaseSparkle(oldest);
    }
    particlesRef.current.push(p);
  }, []);

  const startLoop = React.useCallback(() => {
    if (animFrameRef.current) return;

    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animFrameRef.current = null;
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animFrameRef.current = null;
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update and draw rockets
      const survivingRockets = [];
      rocketsRef.current.forEach((rocket) => {
        if (rocket.update()) {
          rocket.draw(ctx);
          survivingRockets.push(rocket);
        } else if (rocket.exploded) {
          // Explode rocket into sparkles and confetti
          const count = Math.floor(Math.random() * 16 + 24);
          for (let i = 0; i < count; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 1.5;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const color = CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)];
            if (Math.random() < 0.5) {
              addParticle(acquireSparkle(rocket.x, rocket.y, vx, vy, color));
            } else {
              addParticle(acquireConfetti(rocket.x, rocket.y, vx, vy, color));
            }
          }
        }
      });
      rocketsRef.current = survivingRockets;

      // Update and draw particles
      const survivingParticles = [];
      particlesRef.current.forEach((p) => {
        if (p.update()) {
          p.draw(ctx);
          survivingParticles.push(p);
        } else {
          if (p instanceof ConfettiParticle) releaseConfetti(p);
          else if (p instanceof SparkleParticle) releaseSparkle(p);
        }
      });
      particlesRef.current = survivingParticles;

      // Continue loop if there are active elements
      if (particlesRef.current.length > 0 || rocketsRef.current.length > 0) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [addParticle]);

  const spawnConfetti = React.useCallback((origin, count = 70) => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    const origins = origin
      ? [origin.isPixel ? origin : { x: origin.x * w, y: origin.y * h }]
      : [
          { x: w * 0.15, y: h * 0.9, angle: -60 },
          { x: w * 0.85, y: h * 0.9, angle: -120 },
        ];

    origins.forEach((org) => {
      const burstCount = origin ? count : Math.round(count / 2);
      for (let i = 0; i < burstCount; i += 1) {
        const baseAngle = org.angle != null ? (org.angle * Math.PI) / 180 : -Math.PI / 2;
        const spread = (Math.PI / 3) * (Math.random() - 0.5);
        const angle = baseAngle + spread;
        const speed = Math.random() * 8 + 5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const color = CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)];
        addParticle(acquireConfetti(org.x, org.y, vx, vy, color));
      }
    });

    startLoop();
  }, [addParticle, startLoop]);

  const spawnSparkles = React.useCallback((origin, count = 18) => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    const ox = origin?.isPixel ? origin.x : (origin?.x || 0.5) * w;
    const oy = origin?.isPixel ? origin.y : (origin?.y || 0.5) * h;

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3.5 + 1.0;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const color = SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)];
      addParticle(acquireSparkle(ox, oy, vx, vy, color));
    }

    startLoop();
  }, [addParticle, startLoop]);

  const spawnFireworks = React.useCallback((count = 4) => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    const numRockets = Math.min(6, Math.max(3, count));

    for (let i = 0; i < numRockets; i += 1) {
      setTimeout(() => {
        const startX = w * (0.2 + 0.6 * Math.random());
        const targetY = h * (0.2 + 0.35 * Math.random());
        const color = CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)];
        rocketsRef.current.push(new FireworkRocket(startX, targetY, color));
        startLoop();
      }, i * 220);
    }
  }, [startLoop]);

  // Handle incoming celebration events
  React.useEffect(() => {
    const handleCelebrate = (event) => {
      const { mode, origin, count, reduced } = event.detail || {};
      if (reduced) return; // Respect prefers-reduced-motion

      if (mode === "sparkle") {
        spawnSparkles(origin, count || 18);
      } else if (mode === "fireworks") {
        spawnFireworks(count || 4);
        spawnConfetti(null, 40);
        setLiveAnnouncement("축하합니다! 모든 목표와 작업이 완벽하게 완료되었습니다.");
      } else {
        spawnConfetti(origin, count || 70);
        setLiveAnnouncement("축하합니다! 목표를 성공적으로 달성했습니다.");
      }
    };

    window.addEventListener("hub-celebrate", handleCelebrate);
    return () => {
      window.removeEventListener("hub-celebrate", handleCelebrate);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [spawnConfetti, spawnSparkles, spawnFireworks]);

  // Clear live announcement after 3 seconds
  React.useEffect(() => {
    if (!liveAnnouncement) return;
    const timer = setTimeout(() => {
      setLiveAnnouncement("");
    }, 3000);
    return () => clearTimeout(timer);
  }, [liveAnnouncement]);

  // Setup canvas resolution on mount & resize
  React.useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="hub-celebration-canvas"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 2000,
        }}
      />
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {liveAnnouncement}
      </div>
    </>
  );
}
