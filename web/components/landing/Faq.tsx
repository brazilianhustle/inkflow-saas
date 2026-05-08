"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition } from "@/lib/animations";

export default function Faq() {
  return (
    <section
      id="faq"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[820px] mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={fadeUpTransition}
          className="text-center"
        >
          <p className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2 justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            [ {copy.faq.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.faq.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.faq.headlineAccent}</span>
          </h2>
        </motion.div>

        <div className="mt-12 border-t border-b border-[var(--color-border-strong)]">
          {copy.faq.items.map((item, i) => (
            <details
              key={i}
              className={`group ${i < copy.faq.items.length - 1 ? "border-b border-[var(--color-border)]" : ""}`}
            >
              <summary className="flex justify-between items-center py-6 cursor-pointer font-display font-semibold text-[17px] text-text-primary hover:text-[var(--color-accent)] transition-colors list-none">
                <span>{item.q}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-text-muted group-hover:text-[var(--color-accent)] group-open:rotate-180 transition-transform duration-300 ease-[var(--easing-default)]"
                >
                  <path d="M4 6 L8 10 L12 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div
                className="pb-6 max-w-[720px] font-display font-normal text-[15px] text-text-secondary"
                style={{ lineHeight: 1.7 }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
