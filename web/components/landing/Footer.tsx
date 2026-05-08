import Link from "next/link";
import { copy } from "@/lib/copy";

export default function Footer() {
  return (
    <footer
      className="bg-[var(--color-bg)] py-16"
      style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}
    >
      <div className="max-w-[var(--container)] mx-auto">
        {/* Top */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-12 lg:gap-16 pb-12 border-b border-[var(--color-border)]">
          {/* Brand */}
          <div className="max-w-[280px]">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid place-items-center w-[34px] h-[34px] rounded-lg bg-[var(--color-accent)] font-display font-bold text-[18px] text-white">
                I
              </span>
              <span className="font-display font-bold text-[19px] tracking-[-0.5px] text-text-primary">
                InkFlow
              </span>
            </Link>
            <p
              className="font-mono font-normal text-[12px] text-text-muted mt-4"
              style={{ lineHeight: 1.6 }}
            >
              {copy.footer.tagline}
            </p>
          </div>

          {/* Colunas de links */}
          <div className="flex flex-col sm:flex-row gap-8 sm:gap-16">
            {copy.footer.columns.map((col) => (
              <div key={col.header}>
                <div className="font-mono font-medium text-[11px] uppercase tracking-[2px] text-text-muted mb-4">
                  {col.header}
                </div>
                <ul className="flex flex-col gap-2.5">
                  {col.links.map((link) => (
                    <li key={link.href + link.label}>
                      <a
                        href={link.href}
                        className="font-display font-normal text-[14px] text-text-secondary hover:text-text-primary transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <p className="font-display font-normal text-[13px] text-text-muted">
            {copy.footer.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}
