import config from "@ai-kefu/eslint-config/react";

export default [
  ...config,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { project: false },
    },
  },
];
