"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition, staggerContainer } from "@/lib/animations";

export default function Features() {
  return (
    <section
      id="recursos"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[var(--container)] mx-auto">
        {/* Section header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={fadeUpTransition}
          className="max-w-[720px]"
        >
          <p className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            [ {copy.features.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.features.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.features.headlineAccent}</span>
          </h2>
        </motion.div>

        {/* Grid de cards */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16"
        >
          {copy.features.cards.map((card) => (
            <motion.article
              key={card.num}
              variants={fadeUp}
              transition={fadeUpTransition}
              className="group relative bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-[14px] p-9 overflow-hidden transition-all duration-[400ms] ease-[var(--easing-default)] hover:-translate-y-1.5 hover:border-[var(--accent-border)] hover:shadow-[var(--shadow-card)]"
            >
              {/* Barra ::after (top) — Tailwind arbitrary com group-hover */}
              <span
                className="absolute top-0 left-0 right-0 h-0.5 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-[var(--easing-default)]"
                style={{ background: "linear-gradient(90deg, var(--color-accent), transparent)" }}
              />
              <div className="font-mono font-semibold text-[13px] tracking-[1.5px] text-[var(--color-accent)] mb-4">
                {card.num}
              </div>
              <h3
                className="font-display font-semibold text-[22px] text-text-primary mb-3"
                style={{ letterSpacing: "-0.01em", lineHeight: 1.3 }}
              >
                {card.title}
              </h3>
              <p
                className="font-display font-normal text-[15px] text-text-secondary"
                style={{ lineHeight: 1.65 }}
              >
                {card.desc}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
