"use client";

import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface MagicCardProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Colour of the radial spotlight that appears under the cursor.
   * Defaults to a warm white glow that works on dark backgrounds.
   */
  gradientColor?: string;
  /** Size of the radial gradient in pixels. */
  gradientSize?: number;
  /** Opacity of the gradient at its centre (0–1). */
  gradientOpacity?: number;
}

/**
 * Wraps children in a card that tracks the mouse and renders a soft
 * radial-gradient spotlight, creating a premium "glow on hover" effect.
 */
export function MagicCard({
  children,
  className,
  gradientColor = "rgba(255, 255, 255, 0.06)",
  gradientSize = 300,
  gradientOpacity = 1,
}: MagicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    []
  );

  const handleMouseLeave = useCallback(() => setPos(null), []);

  const overlayStyle: React.CSSProperties = pos
    ? {
        background: `radial-gradient(${gradientSize}px circle at ${pos.x}px ${pos.y}px, ${gradientColor}, transparent 70%)`,
        opacity: gradientOpacity,
      }
    : { opacity: 0 };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("group relative overflow-hidden", className)}
    >
      {/* Spotlight overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] transition-opacity duration-300"
        style={overlayStyle}
      />
      {children}
    </div>
  );
}
