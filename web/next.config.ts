import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // Workspace root explicito — repo InkFlow tem package-lock.json na raiz
  // (legado das HTMLs antigas + functions/) e em web/ (Next.js).
  // Sem isto, Next infere a raiz e adverte.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
