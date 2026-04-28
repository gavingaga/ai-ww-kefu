import { useRef, useState, type KeyboardEvent } from "react";

import { Capsule } from "@ai-kefu/ui-glass";

export interface ComposerProps {
  onSend: (text: string) => void;
  /** 附件按钮回调:用户选好文件后触发,App 走 upload-svc 直传流程 */
  onPickFile?: (file: File) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 输入区:胶囊多行输入 + 附件入口 + 发送按钮。
 * - PC: Enter 发送 / Shift+Enter 换行
 * - Mobile: 系统键盘"发送"由 onKeyDown 处理(同 Enter)
 * - 附件按钮 在 M0 占位,文件上传 Story T-401 接入。
 */
export function Composer({ onSend, onPickFile, placeholder = "输入消息...", disabled }: ComposerProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function send() {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue("");
    ref.current?.focus();
    if (ref.current) ref.current.style.height = "auto";
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function autosize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 22 + 16)}px`;
  }

  return (
    <div
      className="safe-bottom"
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        padding: "8px 12px 12px",
        borderTop: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        backdropFilter: "blur(var(--blur-glass)) saturate(180%)",
        WebkitBackdropFilter: "blur(var(--blur-glass)) saturate(180%)",
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,video/mp4"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onPickFile) onPickFile(f);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />
      <button
        aria-label="添加附件"
        disabled={disabled || !onPickFile}
        title="图片 / 文件"
        onClick={() => fileRef.current?.click()}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid var(--color-border)",
          background: "transparent",
          cursor: disabled || !onPickFile ? "not-allowed" : "pointer",
          fontSize: 18,
          flex: "none",
        }}
      >
        📎
      </button>

      <div
        style={{
          flex: 1,
          background: "var(--color-surface-alt)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-input)",
          padding: "6px 14px",
        }}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autosize();
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-label="消息输入框"
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            resize: "none",
            font: "inherit",
            fontSize: "var(--font-size-body)",
            lineHeight: "22px",
            color: "var(--color-text-primary)",
            maxHeight: 5 * 22 + 16,
          }}
        />
      </div>

      <Capsule
        variant="primary"
        size="md"
        onClick={send}
        disabled={disabled || !value.trim()}
        aria-label="发送"
      >
        发送
      </Capsule>
    </div>
  );
}
