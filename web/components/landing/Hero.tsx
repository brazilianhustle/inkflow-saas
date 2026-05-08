"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { startCheckout } from "@/lib/checkout";
import { easingDefault } from "@/lib/animations";
import HeroLines from "./HeroLines";

export default function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden"
      style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}
    >
      {/* SVG linhas onduladas — z-0 */}
      <div className="absolute inset-0 z-0">
        <HeroLines />
      </div>

      {/* Gradient radial overlay — escurece bordas pra linhas "saírem do nada" */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: "radial-gradient(circle at center, transparent 40%, var(--color-bg) 100%)",
        }}
      />

      {/* Conteúdo textual — z-10 */}
      <div className="relative z-10 max-w-[var(--container)] w-full mx-auto">
        <div className="max-w-[720px]">
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: easingDefault }}
            className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            {copy.hero.preheadline}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: easingDefault }}
            className="font-display font-semibold text-text-primary mt-6"
            style={{
              fontSize: "clamp(56px, 9vw, 128px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.04,
            }}
          >
            {copy.hero.headline.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: easingDefault }}
            className="font-display font-normal text-[17px] text-text-secondary max-w-[540px] mt-8"
            style={{ lineHeight: 1.7 }}
          >
            {copy.hero.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease: easingDefault }}
            className="flex flex-wrap gap-4 mt-10"
          >
            <button
              onClick={() => startCheckout("individual")}
              className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-display font-semibold text-[14px] px-[30px] py-[14px] rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-button)]"
            >
              {copy.hero.ctaPrimary} →
            </button>
            <a
              href="#demo"
              className="bg-transparent text-text-primary font-display font-medium text-[14px] px-[28px] py-[14px] rounded-lg border border-white/10 hover:border-[var(--accent-border)] hover:text-[var(--color-accent)] hover:bg-[var(--accent-soft)] transition-all duration-300"
            >
              ▶ {copy.hero.ctaGhost}
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
