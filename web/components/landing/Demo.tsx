"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition, staggerContainer } from "@/lib/animations";

export default function Demo() {
  return (
    <section
      id="demo"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[720px] mx-auto">
        {/* Section header centralizado */}
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
            [ {copy.demo.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.demo.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.demo.headlineAccent}</span>
          </h2>
        </motion.div>

        {/* Mockup WhatsApp */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-[540px] mx-auto mt-16 bg-[#0d1418] border border-[var(--color-border)] rounded-[24px] overflow-hidden"
        >
          {/* Header WhatsApp */}
          <motion.div
            variants={fadeUp}
            transition={fadeUpTransition}
            className="bg-[#1f2c33] px-4 py-3 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] grid place-items-center font-display font-bold text-white text-[15px]">
              I
            </div>
            <div>
              <div className="font-display font-medium text-[15px] text-white">
                {copy.demo.chat.botName}
              </div>
              <div className="font-display text-[12px] text-[#00d4aa]">
                {copy.demo.chat.botStatus}
              </div>
            </div>
          </motion.div>

          {/* Body conversa */}
          <div className="p-4 flex flex-col gap-2">
            {copy.demo.chat.messages.map((msg, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                transition={fadeUpTransition}
                className={`flex ${msg.from === "bot" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 font-display text-[14px] text-white ${
                    msg.from === "bot"
                      ? "bg-[#005c4b] rounded-[8px] rounded-br-[2px]"
                      : "bg-[#1f2c33] rounded-[8px] rounded-bl-[2px]"
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
