import { Capsule, GlassCard } from "@ai-kefu/ui-glass";
import { useState } from "react";

import { login } from "../api/client.js";
import { saveSession, type AdminSession } from "../auth/session.js";

export function LoginGate({ onLogin }: { onLogin: (s: AdminSession) => void }) {
  const [identifier, setIdentifier] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await login(identifier.trim(), password);
      const s: AdminSession = { token: r.token, username: r.user.username, role: r.user.role };
      saveSession(s);
      onLogin(s);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 8%, #f5f5f7) 0%, #ececef 100%)",
      }}
    >
      <GlassCard
        strength="base"
        radius={16}
        style={{ width: 380, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>客服管理后台</h2>
          <p style={{ margin: "4px 0 0", color: "var(--color-text-tertiary)", fontSize: 12 }}>
            可用用户名或邮箱登录(默认 admin / admin)
          </p>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>用户名 / 邮箱</span>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            style={inputStyle}
          />
        </label>
        {err ? <span style={{ color: "#d33", fontSize: 12 }}>错误:{err}</span> : null}
        <Capsule
          size="md"
          variant="primary"
          onClick={submit}
          disabled={busy || !identifier.trim() || !password}
        >
          {busy ? "登录中…" : "登录"}
        </Capsule>
      </GlassCard>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 12px",
  background: "var(--color-surface-alt)",
  color: "var(--color-text-primary)",
  outline: "none",
  font: "inherit",
  fontSize: 14,
};
