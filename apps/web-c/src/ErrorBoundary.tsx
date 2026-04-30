import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  err: Error | null;
  info: string | null;
}

/**
 * 全局错误兜底 — 子树任意 React render / lifecycle throw 都会被捕获,
 * 渲染降级 UI 而不是露出空白(黑底)。dev 模式额外把组件栈打到控制台。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { err: null, info: null };

  static getDerivedStateFromError(err: Error): State {
    return { err, info: null };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    if (import.meta.env?.DEV) {
      console.error("[ErrorBoundary]", err, info.componentStack);
    }
    this.setState({ err, info: info.componentStack ?? null });
  }

  private reset = () => {
    this.setState({ err: null, info: null });
  };

  render() {
    const { err, info } = this.state;
    if (!err) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100dvh",
          padding: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-primary, #f5f5f7)",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            background: "color-mix(in srgb, var(--color-danger, #ff453a) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger, #ff453a) 30%, transparent)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, color: "var(--color-danger, #ff453a)" }}>
            ⚠ 页面渲染出错
          </h2>
          <p style={{ marginTop: 8, color: "var(--color-text-secondary, #c7c7cc)", fontSize: 13 }}>
            {String(err.message || err.name || err)}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              type="button"
              onClick={this.reset}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid var(--color-border, #3a3a3c)",
                background: "var(--color-surface, #1c1c1e)",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              重试渲染
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid var(--color-border, #3a3a3c)",
                background: "var(--color-surface, #1c1c1e)",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              刷新页面
            </button>
          </div>
          {info && import.meta.env?.DEV ? (
            <details style={{ marginTop: 12 }}>
              <summary
                style={{ cursor: "pointer", fontSize: 12, color: "var(--color-text-tertiary)" }}
              >
                组件栈(dev)
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 6,
                  fontSize: 11,
                  overflow: "auto",
                  maxHeight: 240,
                }}
              >
                {info}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    );
  }
}
