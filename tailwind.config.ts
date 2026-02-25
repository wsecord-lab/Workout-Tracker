import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          active: "var(--primary-active)",
          disabled: "var(--primary-disabled)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          hover: "var(--secondary-hover)",
        },
        surface: "var(--surface)",
        background: "var(--background)",
        border: "var(--border)",
        muted: "var(--muted-text)",
        success: {
          DEFAULT: "var(--success)",
          hover: "var(--success-hover)",
        },
        error: {
          DEFAULT: "var(--error)",
          hover: "var(--error-hover)",
        },
        /* Chart palette for data viz */
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
          6: "var(--chart-6)",
        },
      },
      backgroundColor: {
        surface: "var(--surface)",
        background: "var(--background)",
      },
      textColor: {
        DEFAULT: "var(--text)",
        muted: "var(--muted-text)",
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
      ringColor: {
        primary: "var(--primary)",
      },
      boxShadow: {
        "focus-primary": "var(--focus-ring)",
      },
    },
  },
  plugins: [],
};
export default config;
