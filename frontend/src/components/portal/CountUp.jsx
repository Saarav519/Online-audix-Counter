import React, { useEffect, useRef, useState } from 'react';

/**
 * Animated number counter. Counts from 0 → value with easeOut.
 * Usage: <CountUp value={1250} duration={1200} />
 */
export default function CountUp({ value = 0, duration = 900, decimals = 0, prefix = '', suffix = '', className = '' }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(null);
  const fromRef = useRef(0);
  const toRef = useRef(Number(value) || 0);

  useEffect(() => {
    fromRef.current = display;
    toRef.current = Number(value) || 0;
    startRef.current = null;
    let rafId;

    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = fromRef.current + (toRef.current - fromRef.current) * eased;
      setDisplay(current);
      if (t < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = Number(display).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
