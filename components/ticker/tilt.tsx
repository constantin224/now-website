"use client";

import { useRef, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** max. Kippwinkel in Grad */
  max?: number;
  className?: string;
}

// Dezenter 3D-Maus-Tilt — nur Desktop (Pointer fine) und nur ohne
// reduced-motion (Design-Hausregel: Mobile statisch). Pure CSS-Transforms,
// kein Layout-Shift, GPU-freundlich.
export function Tilt({ children, max = 3, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(min-width: 768px) and (pointer: fine)").matches)
      return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1100px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
  }

  function onLeave() {
    const el = ref.current;
    if (el) el.style.transform = "";
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ transition: "transform 300ms ease-out", willChange: "transform" }}
    >
      {children}
    </div>
  );
}
