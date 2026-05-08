"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { startCheckout } from "@/lib/checkout";
import { fadeUp, fadeUpTransition } from "@/lib/animations";

export default function CtaFinal() {
  return (
    <section
      className="relative overflow-hidden bg-[var(--color-bg-card)] border-t border-b border-[var(--color-border)] text-center"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-gap)",
        paddingBottom: "var(--section-gap)",
      }}
    >
      {/* Glow radial decorativo */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: "radial-gradient(circle at center, var(--accent-glow) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUp}
        transition={fadeUpTransition}
        className="relative z-10 max-w-[940px] mx-auto"
      >
        <h2
          className="font-display font-bold text-text-primary"
          style={{ fontSize: "clamp(48px, 8vw, 96px)", letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          <span className="block">{copy.ctaFinal.headlineLine1}</span>
          <span className="block text-[var(--color-accent)]">{copy.ctaFinal.headlineLine2}</span>
        </h2>

        <p
          className="font-display font-normal text-[17px] text-text-secondary mt-6"
          style={{ lineHeight: 1.7 }}
        >
          {copy.ctaFinal.sub}
        </p>

        <button
          onClick={() => startCheckout("individual")}
          className="mt-10 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-display font-semibold text-[14px] px-[30px] py-[14px] rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-button)]"
        >
          {copy.ctaFinal.cta} <span aria-hidden="true">→</span>
        </button>
      </motion.div>
    </section>
  );
}
