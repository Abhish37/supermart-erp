import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        foreground: "#09090b",
        card: "#ffffff",
        "card-subtle": "#f8fafc",
        "card-border": "#e2e8f0",
        muted: "#64748b",
        "muted-dark": "#334155",
        accent: "#0f172a",
        danger: "#dc2626",
        success: "#16a34a",
        warning: "#d97706",
      },
      fontFamily: {
        mono: ["Consolas", "Monaco", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
