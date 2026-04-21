/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        steel: {
          950: "#0b1220",
          900: "#111a2e",
          800: "#18233f",
        },
        accent: {
          cyan: "#22d3ee",
          lime: "#84cc16",
          amber: "#f59e0b",
          red: "#ef4444",
        },
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(34, 211, 238, 0.25), 0 0 24px rgba(34, 211, 238, 0.20)",
      },
    },
  },
  plugins: [],
};
