import { type CSSProperties } from "react";

/**
 * 极简 Markdown 渲染器 — 仅覆盖 PRD 02 §3.2 规定的子集:
 *  - 段落 / 换行
 *  - **加粗**
 *  - * 列表 / 1. 有序列表
 *  - 链接 [text](url)
 *  - `inline code`
 *
 * 故意不引入第三方依赖,保住主 chunk gzip ≤ 180KB 的性能预算(M0 已规定)。
 * 有 XSS 防护:不直接 dangerouslySetInnerHTML,所有节点都走 React。
 */
export function MiniMarkdown({ text, style }: { text: string; style?: CSSProperties }) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const blocks: { type: "p" | "ul" | "ol"; items: string[] }[] = [];

  let buf: string[] = [];
  let mode: "p" | "ul" | "ol" = "p";

  const flush = () => {
    if (!buf.length) return;
    blocks.push({ type: mode, items: buf });
    buf = [];
    mode = "p";
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line === "") {
      flush();
      continue;
    }
    const ulMatch = line.match(/^[-*•]\s+(.*)$/);
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (ulMatch) {
      if (mode !== "ul") flush();
      mode = "ul";
      buf.push(ulMatch[1] ?? "");
    } else if (olMatch) {
      if (mode !== "ol") flush();
      mode = "ol";
      buf.push(olMatch[1] ?? "");
    } else {
      if (mode !== "p") flush();
      mode = "p";
      buf.push(line);
    }
  }
  flush();

  return (
    <div style={{ whiteSpace: "normal", lineHeight: 1.6, ...style }}>
      {blocks.map((b, idx) => {
        if (b.type === "ul") {
          return (
            <ul key={idx} style={{ paddingLeft: 18, margin: "4px 0" }}>
              {b.items.map((it, i) => (
                <li key={i}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={idx} style={{ paddingLeft: 18, margin: "4px 0" }}>
              {b.items.map((it, i) => (
                <li key={i}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} style={{ margin: "4px 0" }}>
            {b.items.map((it, i) => (
              <span key={i}>
                {renderInline(it)}
                {i < b.items.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** 内联格式:**bold** / [text](url) / `code` */
function renderInline(line: string) {
  // 链接:[text](url) — 先于加粗处理,防止 [a **b** c](url) 被破坏
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: (string | { kind: "link"; text: string; url: string })[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(line)) !== null) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    parts.push({ kind: "link", text: m[1] ?? "", url: m[2] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));

  return parts.map((p, idx) => {
    if (typeof p === "string") return <span key={idx}>{boldAndCode(p)}</span>;
    if (!isSafeUrl(p.url)) return <span key={idx}>{p.text}</span>;
    return (
      <a
        key={idx}
        href={p.url}
        target="_blank"
        rel="noreferrer noopener"
        style={{ color: "var(--color-primary)", textDecoration: "none" }}
      >
        {p.text}
      </a>
    );
  });
}

function boldAndCode(s: string) {
  // 切分 `code` 与 **bold**;生成 React 节点数组
  const tokens: { kind: "text" | "bold" | "code"; v: string }[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i) {
        tokens.push({ kind: "code", v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (s[i] === "*" && s[i + 1] === "*") {
      const end = s.indexOf("**", i + 2);
      if (end > i + 1) {
        tokens.push({ kind: "bold", v: s.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // collect plain run
    let j = i;
    while (j < s.length && s[j] !== "`" && !(s[j] === "*" && s[j + 1] === "*")) j++;
    tokens.push({ kind: "text", v: s.slice(i, j) });
    i = j;
  }
  return tokens.map((t, idx) => {
    if (t.kind === "bold") return <b key={idx}>{t.v}</b>;
    if (t.kind === "code")
      return (
        <code
          key={idx}
          style={{
            background: "var(--bubble-system)",
            padding: "1px 6px",
            borderRadius: "var(--radius-xs)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.92em",
          }}
        >
          {t.v}
        </code>
      );
    return <span key={idx}>{t.v}</span>;
  });
}

function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
