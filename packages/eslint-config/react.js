import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

import base from "./index.js";

/** React 项目专用 — 在 base 之上叠 React + Hooks 规则 */
export default [
  ...base,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },
];
