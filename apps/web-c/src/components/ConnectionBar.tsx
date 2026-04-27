import type { ClientStatus } from "@ai-kefu/ws-client";

/**
 * 顶部细线连接状态条 — 仅在非 open 状态显示。
 * - connecting / reconnecting:渐变流光 + "正在连接..."
 * - closed / fatal:红色 + "网络异常,正在重连..."(若 fatal,展示永久 banner)
 */
export function ConnectionBar({ status }: { status: ClientStatus }) {
  if (status.state === "open") return null;

  const isError = status.state === "closed" || status.state === "fatal";
  const text =
    status.state === "fatal"
      ? "无法连接服务,请稍后重试"
      : isError
        ? "网络异常,正在重连..."
        : status.state === "reconnecting"
          ? `正在重连(第 ${status.attempts} 次)...`
          : "正在连接...";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "relative",
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--font-size-caption)",
        color: isError ? "#fff" : "var(--color-text-secondary)",
        background: isError
          ? "color-mix(in srgb, var(--color-critical) 84%, transparent)"
          : "transparent",
        overflow: "hidden",
      }}
    >
      {!isError && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--color-primary) 36%, transparent) 50%, transparent 100%)",
            animation: "aikefu-slide 1.4s linear infinite",
          }}
        />
      )}
      <span style={{ position: "relative" }}>{text}</span>
      <style>{`
        @keyframes aikefu-slide {
          0%   { transform: translateX(-60%); }
          100% { transform: translateX(60%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="status"] span[aria-hidden] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
