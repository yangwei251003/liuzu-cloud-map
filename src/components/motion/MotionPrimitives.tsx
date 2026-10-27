"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { motionDuration, motionEase, motionSpring, revealVariants, staggerVariants } from "@/lib/motion-system";
import { useMotionPreference } from "@/lib/use-motion-preference";

export function Stagger({ children, className, amount = 0.12 }: { children: ReactNode; className?: string; amount?: number }) {
  const { reduced } = useMotionPreference();
  return <motion.div className={className} variants={staggerVariants} initial={reduced ? false : "hidden"} whileInView="visible" viewport={{ once: true, amount }}>{children}</motion.div>;
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={revealVariants}>{children}</motion.div>;
}

export function MaskReveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { reduced } = useMotionPreference();
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, clipPath: "inset(0 0 100% 0)", y: 18 }} whileInView={{ opacity: 1, clipPath: "inset(0 0 0% 0)", y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ duration: motionDuration.cinematic, delay, ease: motionEase.enter }}>{children}</motion.div>;
}

export function MagneticAction({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced } = useMotionPreference();
  const x = useSpring(useMotionValue(0), motionSpring.magnetic);
  const y = useSpring(useMotionValue(0), motionSpring.magnetic);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (reduced || event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - box.left - box.width / 2) * 0.16);
    y.set((event.clientY - box.top - box.height / 2) * 0.16);
  }
  function reset() { x.set(0); y.set(0); }
  return <motion.div className={className} style={{ x, y }} onPointerMove={move} onPointerLeave={reset} whileTap={reduced ? undefined : { scale: 0.96 }}>{children}</motion.div>;
}

export function ParallaxLayer({ children, className, distance = 56 }: { children: ReactNode; className?: string; distance?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPreference();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-distance, distance]);
  return <motion.div ref={ref} className={className} style={{ y }}>{children}</motion.div>;
}

export function AnimatedValue({ value, format = (next) => Math.round(next).toLocaleString("zh-CN"), className }: { value: number; format?: (value: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.7 });
  const { reduced } = useMotionPreference();
  useEffect(() => {
    if (!ref.current || !inView) return;
    if (reduced) { ref.current.textContent = format(value); return; }
    const controls = animate(0, value, { duration: 0.85, ease: motionEase.enter, onUpdate: (latest) => { if (ref.current) ref.current.textContent = format(latest); } });
    return () => controls.stop();
  }, [format, inView, reduced, value]);
  return <span ref={ref} className={className} data-tabular="true">{reduced ? format(value) : format(0)}</span>;
}

export function RouteDraw({ className, path, viewBox = "0 0 640 320" }: { className?: string; path: string; viewBox?: string }) {
  const { reduced } = useMotionPreference();
  return <svg className={className} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true"><motion.path d={path} fill="none" pathLength={1} initial={reduced ? false : { pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={{ once: true, amount: 0.2 }} transition={{ pathLength: { duration: 1.2, ease: motionEase.gentle }, opacity: { duration: 0.2 } }} /></svg>;
}

export function MotionSection(props: HTMLMotionProps<"section">) {
  const { reduced } = useMotionPreference();
  return <motion.section {...props} initial={reduced ? false : "hidden"} whileInView="visible" viewport={{ once: true, amount: 0.12 }} variants={revealVariants} />;
}
