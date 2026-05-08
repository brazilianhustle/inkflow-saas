"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition, staggerContainer } from "@/lib/animations";

export default function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="bg-[var(--color-bg-card)] border-t border-b border-[var(--color-border)]"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[var(--container)] mx-auto">
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
            [ {copy.howItWorks.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.howItWorks.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.howItWorks.headlineAccent}</span>
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 lg:grid-cols-3 gap-0 mt-16"
        >
          {copy.howItWorks.steps.map((step, i) => (
            <motion.div
              key={step.num}
              variants={fadeUp}
              transition={fadeUpTransition}
              className={`px-0 lg:px-10 ${
                i > 0 ? "lg:border-l lg:border-[var(--color-border)]" : ""
              } ${i < copy.howItWorks.steps.length - 1 ? "border-b lg:border-b-0 border-[var(--color-border)] pb-10 lg:pb-0" : ""}`}
            >
              <div
                className="font-display font-bold text-[var(--color-accent)] mb-6"
                style={{ fontSize: "64px", letterSpacing: "-0.02em", lineHeight: 1 }}
              >
                {step.num}
              </div>
              <h3 className="font-display font-semibold text-[20px] text-text-primary mb-3">
                {step.title}
              </h3>
              <p
                className="font-display font-normal text-[15px] text-text-secondary"
                style={{ lineHeight: 1.65 }}
              >
                {step.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
