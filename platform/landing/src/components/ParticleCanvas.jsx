import { useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

/* ═══════════════════════════════════════════════════════════════════════
   FULL-PAGE AMBIENT FLOATING BUBBLES & PARTICLES SYSTEM
   Persistent across the ENTIRE website as the user scrolls.
   - Refined, elegant bubble sizes (6px to 18px)
   - Micro constellation particles with dynamic connecting lines
   - Glowing glass-bubble rim highlights & ethereal radial centers
   ═══════════════════════════════════════════════════════════════════════ */

export default function ParticleCanvas() {
  const canvasRef = useRef(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    let width = window.innerWidth;
    let height = window.innerHeight;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    // Micro constellation particles
    const PARTICLE_COUNT = 60;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5 + 0.6,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      opacity: Math.random() * 0.4 + 0.2,
      hue: Math.random() > 0.5 ? 229 : 255, // indigo / violet
    }));

    // Sleek, refined floating ambient bubbles (smaller, subtle sizes ~2px to 4.5px)
    const BUBBLE_COUNT = 50;
    const bubbles = Array.from({ length: BUBBLE_COUNT }, () => {
      const baseR = Math.random() * 2.5 + 2; // 2px to 4.5px
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        radius: baseR,
        baseRadius: baseR,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(Math.random() * 0.45 + 0.2), // gentle upward drift
        pulseSpeed: Math.random() * 0.03 + 0.015,
        pulseOffset: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.6 ? 245 : Math.random() > 0.3 ? 275 : 190, // indigo, purple, cyan
      };
    });

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      const isLight = themeRef.current === 'light';

      // ── 1. Draw Sleek Glowing Floating Bubbles ──
      bubbles.forEach((b) => {
        b.x += b.vx;
        b.y += b.vy;

        // Subtle breathing oscillation
        b.radius = b.baseRadius + Math.sin(time * 0.002 + b.pulseOffset) * 0.4;

        // Wrap around vertically and horizontally
        if (b.y + b.radius < 0) {
          b.y = height + b.radius;
          b.x = Math.random() * width;
        }
        if (b.x - b.radius > width) b.x = -b.radius;
        if (b.x + b.radius < 0) b.x = width + b.radius;

        // Ethereal radial gradient for delicate glass bubble effect
        const grad = ctx.createRadialGradient(
          b.x - b.radius * 0.3,
          b.y - b.radius * 0.3,
          b.radius * 0.05,
          b.x,
          b.y,
          b.radius
        );

        if (isLight) {
          grad.addColorStop(0, `hsla(${b.hue}, 85%, 60%, 0.35)`);
          grad.addColorStop(0.5, `hsla(${b.hue}, 80%, 55%, 0.15)`);
          grad.addColorStop(1, `hsla(${b.hue}, 80%, 50%, 0)`);
        } else {
          grad.addColorStop(0, `hsla(${b.hue}, 90%, 75%, 0.38)`);
          grad.addColorStop(0.55, `hsla(${b.hue}, 85%, 68%, 0.14)`);
          grad.addColorStop(1, `hsla(${b.hue}, 80%, 60%, 0)`);
        }

        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(b.radius, 1), 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Crisp rim ring highlight for bubble definition
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(b.radius, 1), 0, Math.PI * 2);
        ctx.strokeStyle = isLight
          ? `hsla(${b.hue}, 80%, 50%, 0.28)`
          : `hsla(${b.hue}, 90%, 78%, 0.35)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tiny glint of light on bubble top-left
        ctx.beginPath();
        ctx.arc(
          b.x - b.radius * 0.35,
          b.y - b.radius * 0.35,
          Math.max(b.radius * 0.22, 1),
          0,
          Math.PI * 2
        );
        ctx.fillStyle = isLight
          ? 'rgba(255, 255, 255, 0.55)'
          : 'rgba(255, 255, 255, 0.75)';
        ctx.fill();
      });

      // ── 2. Draw Micro Constellation Particles & Lines ──
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        if (isLight) {
          ctx.fillStyle = `hsla(${p.hue}, 80%, 48%, ${p.opacity * 1.3})`;
        } else {
          ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${p.opacity})`;
        }
        ctx.fill();
      });

      // Constellation connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            const lineOpacity = isLight
              ? 0.14 * (1 - dist / 110)
              : 0.09 * (1 - dist / 110);
            const lineRgb = isLight ? '79, 70, 229' : '129, 140, 248';
            ctx.strokeStyle = `rgba(${lineRgb}, ${lineOpacity})`;
            ctx.lineWidth = isLight ? 0.75 : 0.5;
            ctx.stroke();
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    }

    resize();
    animationId = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="global-particle-canvas"
      aria-hidden="true"
    />
  );
}
