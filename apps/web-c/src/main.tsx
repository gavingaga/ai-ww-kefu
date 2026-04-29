import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles.css";
import { applyTheme, readThemeMode } from "./theme.js";

// 启动应用主题(URL ?theme= → localStorage → prefers-color-scheme)
applyTheme(readThemeMode());

// 读取形态参数,在根节点上打 data-form,样式按需扩展
const form = new URL(window.location.href).searchParams.get("form");
if (form === "bubble" || form === "drawer" || form === "fullscreen") {
  document.documentElement.setAttribute("data-form", form);
}

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
