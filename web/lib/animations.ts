import type { Variants, Transition } from "motion/react";

export const easingDefault: Transition["ease"] = [0.25, 0.46, 0.45, 0.94];

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

export const fadeUpTransition: Transition = {
  duration: 0.7,
  ease: easingDefault,
};
