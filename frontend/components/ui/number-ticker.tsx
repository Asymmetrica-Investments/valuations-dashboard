"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

interface NumberTickerProps {
  /** The target number to count up to. */
  value: number;
  /** Delay before the animation starts, in seconds. */
  delay?: number;
  /** Number of decimal places to display. */
  decimalPlaces?: number;
  /** Optional formatter — receives the animated number, returns a display string. */
  format?: (value: number) => string;
  className?: string;
}

/**
 * Animates a number from 0 to `value` using a spring physics simulation.
 * Pass a `format` function to render the number as currency, %, etc.
 */
export function NumberTicker({
  value,
  delay = 0,
  decimalPlaces = 0,
  format,
  className,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  });

  // Kick off the animation after `delay` seconds
  useEffect(() => {
    const timer = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(timer);
  }, [motionValue, value, delay]);

  // Write the formatted value directly into the DOM on every spring frame
  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (!ref.current) return;
      ref.current.textContent = format
        ? format(latest)
        : Intl.NumberFormat("en-US", {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
          }).format(Number(latest.toFixed(decimalPlaces)));
    });
  }, [springValue, decimalPlaces, format]);

  return <span ref={ref} className={cn("tabular-nums", className)} />;
}
