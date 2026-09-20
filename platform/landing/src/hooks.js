import { useState, useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOM HOOKS
   ═══════════════════════════════════════════════════════════════════════ */

// Scroll-reveal hook
export function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, visible];
}

// Animated counter hook
export function useCounter(target, duration = 2000, startOnVisible = true) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!startOnVisible) {
      setStarted(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); obs.unobserve(el); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (!started) return;
    let raf;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.floor(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [started, target, duration]);

  return [ref, count];
}

// Typing animation hook
export function useTyping(texts, typeSpeed = 80, deleteSpeed = 40, pauseMs = 2000) {
  const [display, setDisplay] = useState('');
  const [textIdx, setTextIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = texts[textIdx];
    let timeout;

    if (!isDeleting && charIdx < current.length) {
      timeout = setTimeout(() => {
        setDisplay(current.slice(0, charIdx + 1));
        setCharIdx(charIdx + 1);
      }, typeSpeed);
    } else if (!isDeleting && charIdx === current.length) {
      timeout = setTimeout(() => setIsDeleting(true), pauseMs);
    } else if (isDeleting && charIdx > 0) {
      timeout = setTimeout(() => {
        setDisplay(current.slice(0, charIdx - 1));
        setCharIdx(charIdx - 1);
      }, deleteSpeed);
    } else if (isDeleting && charIdx === 0) {
      setIsDeleting(false);
      setTextIdx((textIdx + 1) % texts.length);
    }

    return () => clearTimeout(timeout);
  }, [charIdx, isDeleting, textIdx, texts, typeSpeed, deleteSpeed, pauseMs]);

  return display;
}

// Mouse tracker for spotlight effect
export function useMouseTracker() {
  const ref = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--mouse-x', `${x}%`);
    el.style.setProperty('--mouse-y', `${y}%`);
  }, []);

  return [ref, handleMouseMove];
}
