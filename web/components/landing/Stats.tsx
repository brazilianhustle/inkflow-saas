"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition } from "@/lib/animations";

export default function Stats() {
  return (
    <section
      className="bg-[var(--color-bg-card)] border-t border-b border-[var(--color-border)] py-12"
      style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}
    >
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUp}
        transition={fadeUpTransition}
        className="max-w-[var(--container)] mx-auto grid grid-cols-2 md:grid-cols-4 gap-x-0 gap-y-6"
      >
        {copy.stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`text-center px-6 ${i < copy.stats.length - 1 ? "md:border-r md:border-[var(--color-border)]" : ""}`}
          >
            <div
              className="font-display font-bold text-text-primary"
              style={{ fontSize: "clamp(40px, 5vw, 64px)", letterSpacing: "-0.02em", lineHeight: 1 }}
            >
              {stat.value}
            </div>
            <div className="font-mono font-medium text-[11px] uppercase tracking-[2px] text-text-muted mt-2">
              {stat.label}
            </div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
