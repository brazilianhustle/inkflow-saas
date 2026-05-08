"use client";

import { motion } from "motion/react";

export default function HeroLines() {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      {/* Curva 1: vermelha sólida */}
      <motion.path
        d="M -100 500 Q 360 300, 720 500 T 1540 500"
        stroke="#e8260a"
        strokeWidth="2.5"
        fill="none"
        animate={{
          d: [
            "M -100 500 Q 360 300, 720 500 T 1540 500",
            "M -100 480 Q 360 320, 720 510 T 1540 490",
            "M -100 500 Q 360 300, 720 500 T 1540 500",
          ],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Curva 2: branca sólida (fase 6s) */}
      <motion.path
        d="M -100 600 Q 480 480, 960 580 T 1540 600"
        stroke="#ededef"
        strokeWidth="1.5"
        fill="none"
        opacity={0.7}
        animate={{
          d: [
            "M -100 600 Q 480 480, 960 580 T 1540 600",
            "M -100 580 Q 480 500, 960 590 T 1540 590",
            "M -100 600 Q 480 480, 960 580 T 1540 600",
          ],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 6 }}
      />

      {/* Curva 3: cinza tracejada (fase 3s) */}
      <motion.path
        d="M -100 550 Q 400 400, 800 540 T 1540 540"
        stroke="#4a4a55"
        strokeWidth="1.5"
        strokeDasharray="8 6"
        fill="none"
        animate={{
          d: [
            "M -100 550 Q 400 400, 800 540 T 1540 540",
            "M -100 530 Q 400 420, 800 550 T 1540 530",
            "M -100 550 Q 400 400, 800 540 T 1540 540",
          ],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
    </svg>
  );
}
