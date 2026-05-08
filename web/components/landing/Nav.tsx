"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { startCheckout } from "@/lib/checkout";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 h-[72px] transition-all duration-[400ms] ${
          scrolled
            ? "bg-[rgba(8,8,12,0.85)] backdrop-blur-[20px] backdrop-saturate-150 border-b border-[var(--color-border)]"
            : "bg-transparent border-b border-transparent"
        }`}
        style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}
      >
        <div className="h-full max-w-[var(--container)] mx-auto flex items-center justify-between gap-8">
          {/* Logo + nome */}
          <a href="/" className="flex items-center gap-3">
            <span className="grid place-items-center w-[34px] h-[34px] rounded-lg bg-[var(--color-accent)] font-display font-bold text-[18px] text-white">
              I
            </span>
            <span className="font-display font-bold text-[19px] tracking-[-0.5px] text-text-primary">
              InkFlow
            </span>
          </a>

          {/* Links centrais (desktop) */}
          <ul className="hidden lg:flex items-center gap-7">
            {copy.nav.links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="font-mono font-medium text-[13px] uppercase tracking-[1.2px] text-text-secondary hover:text-text-primary relative group transition-colors"
                >
                  {link.label}
                  <span className="absolute bottom-[-4px] left-0 h-px bg-current w-0 group-hover:w-full transition-all duration-300 ease-[var(--easing-default)]" />
                </a>
              </li>
            ))}
          </ul>

          {/* CTA pill (desktop + mobile sempre visível) */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => startCheckout("individual")}
              className="hidden sm:inline-block bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-display font-semibold text-[13px] px-[22px] py-[10px] rounded-lg transition-all duration-300 hover:-translate-y-px"
            >
              {copy.nav.cta}
            </button>

            {/* Hamburger mobile */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Abrir menu"
              aria-expanded={mobileOpen}
              className="lg:hidden text-text-primary"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileOpen ? (
                  <path d="M6 6 L18 18 M18 6 L6 18" strokeLinecap="round" />
                ) : (
                  <>
                    <line x1="3" y1="7" x2="21" y2="7" strokeLinecap="round" />
                    <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" />
                    <line x1="3" y1="17" x2="21" y2="17" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[var(--color-bg)] pt-[72px] lg:hidden">
          <ul className="flex flex-col items-center gap-8 pt-12">
            {copy.nav.links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="font-display font-semibold text-[24px] text-text-primary"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  startCheckout("individual");
                }}
                className="bg-[var(--color-accent)] text-white font-display font-semibold text-[14px] px-8 py-3 rounded-lg"
              >
                {copy.nav.cta}
              </button>
            </li>
          </ul>
        </div>
      )}
    </>
  );
}
