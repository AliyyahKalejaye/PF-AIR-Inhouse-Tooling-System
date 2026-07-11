import type { Config } from "tailwindcss";

// Design tokens matching the approved mockups (inventory dashboard,
// architecture diagram, and the 18 approved screens) — keep this in sync
// if the palette ever changes, since every screen was built against these
// exact values.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        indigo: {
          50: "#eef2ff",
          100: "#e0e7ff",
          600: "#4f46e5",
          700: "#4338ca",
        },
        slate: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          900: "#0f172a",
        },
        amber: { 50: "#fffbeb", 500: "#f59e0b" },
        emerald: { 50: "#ecfdf5", 500: "#10b981" },
        rose: { 50: "#fef2f2", 500: "#ef4444" },
        cyan: { 50: "#ecfeff", 600: "#0e7490" },
        purple: { 50: "#faf5ff", 600: "#7c3aed" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
