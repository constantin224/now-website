"use client";
import { useScrollReveal } from "@/lib/hooks/use-scroll-reveal";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Vertikaler Offset in Pixel (Standard: 30) */
  y?: number;
  /** Animationsdauer in Sekunden (Standard: 0.8) */
  duration?: number;
  /** Verzoegerung in Sekunden (Standard: 0) */
  delay?: number;
  /** ScrollTrigger start Position (Standard: "top 85%") */
  start?: string;
  /** HTML-Tag (Standard: "div") */
  as?: "div" | "section" | "article" | "aside";
}

export function ScrollReveal({
  children,
  className,
  as: Tag = "div",
  y,
  duration,
  delay,
  start,
}: ScrollRevealProps) {
  const ref = useScrollReveal({ y, duration, delay, start });
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
