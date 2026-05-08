"use client";

import { motion } from "motion/react";

// Linhas onduladas de fundo — 3 paths SVG animadas continuamente.
// Movimento sutil: cada linha mantem sua altura base e oscila ~30-40px
// pra cima e pra baixo. Cycle times longos (14-18s) e fases distintas
// pra evitar sincronia obvia. prefers-reduced-motion tratado em globals.css.
export default function HeroLines() {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      {/* Curva 1: vermelha sólida — passa entre pré-headline e headline (~y 340). */}
      <motion.path
        stroke="#e8260a"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
        animate={{
          d: [
            "M -100 340 Q 360 280, 720 360 T 1540 340",
            "M -100 360 Q 360 320, 720 340 T 1540 360",
            "M -100 320 Q 360 260, 720 380 T 1540 320",
            "M -100 350 Q 360 300, 720 350 T 1540 350",
            "M -100 340 Q 360 280, 720 360 T 1540 340",
          ],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Curva 2: branca sólida fina — entre as linhas do headline (~y 520). */}
      <motion.path
        stroke="#ededef"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
        animate={{
          d: [
            "M -100 520 Q 480 560, 960 500 T 1540 520",
            "M -100 540 Q 480 580, 960 510 T 1540 510",
            "M -100 510 Q 480 540, 960 530 T 1540 530",
            "M -100 525 Q 480 565, 960 495 T 1540 525",
            "M -100 520 Q 480 560, 960 500 T 1540 520",
          ],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />

      {/* Curva 3: cinza tracejada — abaixo do headline (~y 680). */}
      <motion.path
        stroke="#4a4a55"
        strokeWidth={1.5}
        strokeDasharray="10 8"
        strokeLinecap="round"
        fill="none"
        animate={{
          d: [
            "M -100 680 Q 400 660, 800 700 T 1540 680",
            "M -100 700 Q 400 680, 800 690 T 1540 670",
            "M -100 670 Q 400 650, 800 710 T 1540 690",
            "M -100 685 Q 400 665, 800 695 T 1540 675",
            "M -100 680 Q 400 660, 800 700 T 1540 680",
          ],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
    </svg>
  );
}
