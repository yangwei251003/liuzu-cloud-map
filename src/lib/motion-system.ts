import type { Transition, Variants } from "framer-motion";

export type MotionTier = "cinematic" | "expressive" | "utility";

export const motionDuration = {
  instant: 0.12,
  fast: 0.18,
  standard: 0.32,
  reveal: 0.58,
  cinematic: 0.92,
} as const;

export const motionEase = {
  enter: [0.16, 1, 0.3, 1],
  move: [0.65, 0, 0.35, 1],
  gentle: [0.22, 1, 0.36, 1],
} as const;

export const motionSpring = {
  responsive: { type: "spring", stiffness: 420, damping: 32, mass: 0.65 },
  expressive: { type: "spring", stiffness: 230, damping: 24, mass: 0.8 },
  magnetic: { type: "spring", stiffness: 350, damping: 25, mass: 0.45 },
} satisfies Record<string, Transition>;

export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionDuration.reveal, ease: motionEase.enter } },
};

export const staggerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.065, delayChildren: 0.04 } },
};

export function tierForPath(pathname: string): MotionTier {
  if (pathname === "/" || pathname.startsWith("/cloud-tour")) return "cinematic";
  if (/^\/(arrival|journey|community|profile|plan|guide)/.test(pathname)) return "expressive";
  return "utility";
}
