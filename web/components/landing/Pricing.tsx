"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { startCheckout, type Plan } from "@/lib/checkout";
import { fadeUp, fadeUpTransition, staggerContainer } from "@/lib/animations";

export default function Pricing() {
  return (
    <section
      id="planos"
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
          className="text-center"
        >
          <p className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2 justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            [ {copy.pricing.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.pricing.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.pricing.headlineAccent}</span>
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-16 items-stretch"
        >
          {copy.pricing.plans.map((plan) => {
            const badge = "badge" in plan ? plan.badge : undefined;
            return (
              <motion.div
                key={plan.id}
                variants={fadeUp}
                transition={fadeUpTransition}
                className={`relative bg-[var(--color-bg)] rounded-[14px] p-10 flex flex-col gap-6 ${
                  plan.highlighted
                    ? "border border-[var(--color-accent)]"
                    : "border border-[var(--color-border)]"
                }`}
              >
                {plan.highlighted && badge && (
                  <div className="absolute -top-3 right-6 bg-[var(--color-accent)] text-white font-mono font-semibold text-[10px] uppercase tracking-[1.5px] px-2.5 py-1 rounded-full">
                    {badge}
                  </div>
                )}

                <div className="font-display font-semibold text-[20px] text-text-primary">
                  {plan.name}
                </div>

                <div>
                  <span
                    className="font-display font-bold text-text-primary"
                    style={{ fontSize: "56px", letterSpacing: "-0.02em", lineHeight: 1 }}
                  >
                    R${plan.price}
                  </span>
                  <span className="font-display font-normal text-[15px] text-text-secondary ml-1">
                    /mês
                  </span>
                </div>

                <ul className="flex flex-col gap-3 flex-1">
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex gap-3 font-display font-normal text-[15px] text-text-primary"
                    >
                      <span className="text-text-muted">✓</span>
                      <span>{feature.text}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => startCheckout(plan.id as Plan)}
                  className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-display font-semibold text-[14px] py-[14px] rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-button)]"
                >
                  {plan.ctaPrimary} →
                </button>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
