"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { useMotionPreference } from "@/lib/use-motion-preference";
import { motionDuration, motionEase } from "@/lib/motion-system";

const MOTION_EASE = motionEase.enter;

type CulturalTextRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  reducedMotion?: boolean;
};

export function CulturalTextReveal({ children, className, delay = 0, reducedMotion }: CulturalTextRevealProps) {
  const preference = useMotionPreference();
  const reduceMotion = reducedMotion ?? preference.reduced;

  return (
    <motion.span
      className={className}
      initial={reduceMotion ? false : { clipPath: "inset(0 100% 0 0)", opacity: 0, y: 14 }}
      animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1, y: 0 }}
      transition={{ duration: motionDuration.cinematic, delay, ease: MOTION_EASE }}
    >
      {children}
    </motion.span>
  );
}

type SectionRevealProps = Omit<HTMLMotionProps<"section">, "children" | "initial" | "whileInView" | "viewport" | "transition"> & {
  children: ReactNode;
  delay?: number;
  amount?: number;
  reducedMotion?: boolean;
};

export function SectionReveal({ children, delay = 0, amount = 0.18, reducedMotion, ...props }: SectionRevealProps) {
  const preference = useMotionPreference();
  const reduceMotion = reducedMotion ?? preference.reduced;

  return (
    <motion.section
      {...props}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.52, delay, ease: MOTION_EASE }}
    >
      {children}
    </motion.section>
  );
}

type DecorativeLayerProps = {
  className?: string;
};

export function CulturalPatternLayer({ className }: DecorativeLayerProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 960 420"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-cultural-pattern="lingnan-contours"
    >
      <path className="cultural-pattern-layer__path" d="M-30 84C112 24 196 152 330 95s230-52 334 12 192 8 356-34" />
      <path className="cultural-pattern-layer__path cultural-pattern-layer__path--slow" d="M-38 194c128-72 232 80 360 18s246-68 360 12 205 22 336-30" />
      <path className="cultural-pattern-layer__path cultural-pattern-layer__path--river" d="M-20 342c112-92 203-32 272-78s148-116 248-50 152 76 266 8 144-50 246-68" />
      <circle className="cultural-pattern-layer__node" cx="700" cy="178" r="5" />
      <circle className="cultural-pattern-layer__node cultural-pattern-layer__node--second" cx="816" cy="272" r="3.5" />
    </svg>
  );
}

export function RouteDraw({ className }: DecorativeLayerProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 640 320"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-cultural-route="decorative"
    >
      <path className="cultural-route__line" d="M40 256C142 224 128 166 248 174s132 74 222 20 70-98 130-112" />
      <circle className="cultural-route__node" cx="40" cy="256" r="6" />
      <circle className="cultural-route__node cultural-route__node--middle" cx="248" cy="174" r="5" />
      <circle className="cultural-route__node cultural-route__node--end" cx="600" cy="82" r="7" />
    </svg>
  );
}
